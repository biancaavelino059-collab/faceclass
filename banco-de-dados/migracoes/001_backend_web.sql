-- FaceClass: migração do schema original para o backend web.
-- MySQL 8+, execute no Workbench com permissão para alterar schema e criar rotinas.
-- FAÇA BACKUP e pare a API/worker. Não apaga alunos ou presenças.
-- Não altera valores de senha e não enfileira avisos para registros antigos.
-- DDL no MySQL faz autocommit. As verificações permitem retomar execução parcial.
USE faceclass;

DELIMITER $$

-- Remove somente a rotina auxiliar desta migração, se uma execução falhou.
DROP PROCEDURE IF EXISTS faceclass_migrar_001_web$$

CREATE PROCEDURE faceclass_migrar_001_web()
BEGIN
    DECLARE indice_responsavel VARCHAR(64);
    DECLARE fila_existe INT DEFAULT 0;

    -- Preflight: antes do primeiro ALTER.
    IF DATABASE() <> 'faceclass' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Selecione o banco faceclass.';
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('aluno', 'presenca')
          AND ENGINE = 'InnoDB') <> 2 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'aluno e presenca precisam existir e usar InnoDB.';
    END IF;
    IF (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aluno'
          AND COLUMN_NAME IN ('id','nome','RA','senha','email','nome_responsavel',
                              'email_responsavel','telefone_responsavel')) <> 8
       OR (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presenca'
          AND COLUMN_NAME IN ('id','aluno_id','tipo','data','horario',
                              'latitude','longitude','validacao_facial')) <> 8 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Schema diferente do original. Revise com a equipe do banco.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND ((TABLE_NAME = 'aluno' AND COLUMN_NAME = 'id')
               OR (TABLE_NAME = 'presenca' AND COLUMN_NAME IN ('id','aluno_id')))
          AND (DATA_TYPE <> 'int' OR COLUMN_TYPE LIKE '%unsigned%' OR IS_NULLABLE <> 'NO')
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'IDs precisam ser INT signed como no contrato. Revise antes de alterar.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM presenca GROUP BY aluno_id, data, tipo HAVING COUNT(*) > 1
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Ha presencas duplicadas por aluno/dia/tipo. Revise sem apagar automaticamente.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM presenca p LEFT JOIN aluno a ON a.id = p.aluno_id WHERE a.id IS NULL
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Ha presencas sem aluno correspondente. Revise os dados.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
        WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
          AND REFERENCED_TABLE_NAME = 'aluno'
          AND REFERENCED_COLUMN_NAME IN ('email_responsavel','telefone_responsavel')
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Outro vinculo usa os contatos do responsavel. Revise as chaves antes.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aluno' AND NON_UNIQUE = 0
        GROUP BY INDEX_NAME
        HAVING COUNT(*) > 1 AND SUM(COLUMN_NAME IN ('email_responsavel','telefone_responsavel')) > 0
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Indice composto nos contatos do responsavel. Revise antes de remover.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aluno'
          AND COLUMN_NAME = 'senha' AND DATA_TYPE NOT IN ('char','varchar')
    ) OR EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aluno'
          AND COLUMN_NAME = 'telefone_responsavel'
          AND DATA_TYPE NOT IN ('decimal','char','varchar')
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Tipo inesperado para senha/telefone. Revise o schema.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM aluno WHERE CHAR_LENGTH(CAST(telefone_responsavel AS CHAR)) > 20
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Telefone com mais de 20 caracteres. Revise para evitar truncamento.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aluno'
          AND (
            (COLUMN_NAME = 'rosto_template' AND (DATA_TYPE <> 'longtext' OR IS_NULLABLE <> 'YES'))
            OR (COLUMN_NAME = 'rosto_modelo' AND
                (DATA_TYPE <> 'varchar' OR CHARACTER_MAXIMUM_LENGTH < 80 OR IS_NULLABLE <> 'YES'))
            OR (COLUMN_NAME = 'rosto_cadastrado_em' AND (DATA_TYPE <> 'datetime' OR IS_NULLABLE <> 'YES'))
          )
    ) OR EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presenca'
          AND COLUMN_NAME = 'motivo_saida' AND
          (IS_NULLABLE <> 'YES' OR DATA_TYPE NOT IN ('varchar','text','mediumtext','longtext')
           OR (DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH < 500))
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Campo novo ja existe com formato diferente. Revise antes de continuar.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presenca'
          AND INDEX_NAME = 'uq_presenca_diaria'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presenca'
          AND INDEX_NAME = 'uq_presenca_diaria' AND NON_UNIQUE = 0
        GROUP BY INDEX_NAME
        HAVING GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) = 'aluno_id,data,tipo'
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Nome uq_presenca_diaria ocupado por outro indice.';
    END IF;

    SELECT COUNT(*) INTO fila_existe FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificacao_email';
    IF fila_existe > 0 THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificacao_email' AND ENGINE = 'InnoDB'
        ) OR (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificacao_email'
              AND COLUMN_NAME IN ('id','presenca_id','destinatario','assunto','corpo','status',
                                  'tentativas','proxima_tentativa','reserva_token','reservado_ate',
                                  'criado_em','enviado_em','ultimo_erro')) <> 13 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Fila existente diferente do contrato da API. Revise a tabela.';
        END IF;
        IF EXISTS (
            SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificacao_email' AND (
                (COLUMN_NAME IN ('proxima_tentativa','reservado_ate','criado_em','enviado_em')
                    AND DATA_TYPE <> 'datetime')
                OR (COLUMN_NAME IN ('destinatario','assunto','reserva_token','ultimo_erro')
                    AND DATA_TYPE <> 'varchar')
                OR (COLUMN_NAME = 'destinatario' AND CHARACTER_MAXIMUM_LENGTH < 120)
                OR (COLUMN_NAME = 'assunto' AND CHARACTER_MAXIMUM_LENGTH < 200)
                OR (COLUMN_NAME = 'reserva_token' AND CHARACTER_MAXIMUM_LENGTH < 64)
                OR (COLUMN_NAME = 'ultimo_erro' AND CHARACTER_MAXIMUM_LENGTH < 500)
                OR (COLUMN_NAME = 'id' AND
                    (DATA_TYPE <> 'bigint' OR EXTRA NOT LIKE '%auto_increment%'))
                OR (COLUMN_NAME IN ('presenca_id','tentativas') AND DATA_TYPE <> 'int')
                OR (COLUMN_NAME = 'corpo' AND DATA_TYPE NOT IN ('text','mediumtext','longtext'))
                OR (COLUMN_NAME = 'status' AND
                    COLUMN_TYPE <> 'enum(''pendente'',''enviando'',''enviado'',''falhou'')')
                OR (COLUMN_NAME IN ('reserva_token','reservado_ate','enviado_em','ultimo_erro')
                    AND IS_NULLABLE <> 'YES')
                OR (COLUMN_NAME IN ('id','presenca_id','destinatario','assunto','corpo','status',
                                    'tentativas','proxima_tentativa','criado_em')
                    AND IS_NULLABLE <> 'NO')
            )
        ) OR NOT EXISTS (
            SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificacao_email' AND NON_UNIQUE = 0
            GROUP BY INDEX_NAME HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME) = 'presenca_id'
        ) OR NOT EXISTS (
            SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificacao_email'
              AND COLUMN_NAME = 'presenca_id' AND REFERENCED_TABLE_SCHEMA = DATABASE()
              AND REFERENCED_TABLE_NAME = 'presenca' AND REFERENCED_COLUMN_NAME = 'id'
        ) THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Tipos/chaves da fila existente diferentes. Revise com a equipe.';
        END IF;
    END IF;

    -- Daqui em diante, uma falha não desfaz DDL já aplicado. Faça backup.
    -- Não reduz o tamanho de senhas que já caibam no contrato.
    IF (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aluno' AND COLUMN_NAME = 'senha') < 255 THEN
        ALTER TABLE aluno MODIFY COLUMN senha VARCHAR(255) NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aluno'
          AND COLUMN_NAME = 'telefone_responsavel'
          AND (DATA_TYPE <> 'varchar' OR CHARACTER_MAXIMUM_LENGTH < 20)
    ) THEN
        ALTER TABLE aluno MODIFY COLUMN telefone_responsavel VARCHAR(20) NOT NULL;
    END IF;

    -- Descobre nomes reais; remove somente UNIQUE de coluna única do responsável.
    indices: LOOP
        SET indice_responsavel = NULL;
        SELECT MIN(INDEX_NAME) INTO indice_responsavel FROM (
            SELECT INDEX_NAME FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aluno' AND NON_UNIQUE = 0
              AND INDEX_NAME <> 'PRIMARY'
            GROUP BY INDEX_NAME
            HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME) IN ('email_responsavel','telefone_responsavel')
        ) AS candidatos;
        IF indice_responsavel IS NULL THEN LEAVE indices; END IF;
        SET @faceclass_migracao_sql = CONCAT(
            'ALTER TABLE aluno DROP INDEX ',
            CHAR(96), REPLACE(indice_responsavel, CHAR(96), CONCAT(CHAR(96), CHAR(96))), CHAR(96)
        );
        PREPARE faceclass_migracao_stmt FROM @faceclass_migracao_sql;
        EXECUTE faceclass_migracao_stmt;
        DEALLOCATE PREPARE faceclass_migracao_stmt;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aluno' AND COLUMN_NAME = 'rosto_template') THEN
        ALTER TABLE aluno ADD COLUMN rosto_template LONGTEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aluno' AND COLUMN_NAME = 'rosto_modelo') THEN
        ALTER TABLE aluno ADD COLUMN rosto_modelo VARCHAR(80) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aluno' AND COLUMN_NAME = 'rosto_cadastrado_em') THEN
        ALTER TABLE aluno ADD COLUMN rosto_cadastrado_em DATETIME NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presenca' AND COLUMN_NAME = 'motivo_saida') THEN
        ALTER TABLE presenca ADD COLUMN motivo_saida VARCHAR(500) NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presenca' AND NON_UNIQUE = 0
        GROUP BY INDEX_NAME HAVING GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) = 'aluno_id,data,tipo'
    ) THEN
        ALTER TABLE presenca ADD UNIQUE KEY uq_presenca_diaria (aluno_id, data, tipo);
    END IF;

    IF fila_existe = 0 THEN
        CREATE TABLE notificacao_email (
            id BIGINT PRIMARY KEY AUTO_INCREMENT NOT NULL,
            presenca_id INT NOT NULL,
            destinatario VARCHAR(120) NOT NULL,
            assunto VARCHAR(200) NOT NULL,
            corpo TEXT NOT NULL,
            status ENUM('pendente','enviando','enviado','falhou') NOT NULL DEFAULT 'pendente',
            tentativas INT NOT NULL DEFAULT 0,
            proxima_tentativa DATETIME NOT NULL,
            reserva_token VARCHAR(64) NULL,
            reservado_ate DATETIME NULL,
            criado_em DATETIME NOT NULL,
            enviado_em DATETIME NULL,
            ultimo_erro VARCHAR(500) NULL,
            UNIQUE KEY uq_notificacao_presenca (presenca_id),
            KEY idx_fila_email (status, proxima_tentativa),
            KEY idx_fila_email_reserva (status, reservado_ate),
            CONSTRAINT fk_notificacao_presenca FOREIGN KEY (presenca_id) REFERENCES presenca(id)
        ) ENGINE=InnoDB;
    END IF;

    SELECT 'Schema atualizado; execute migrar-senhas com o novo backend antes do login.' AS resultado;
END$$

CALL faceclass_migrar_001_web()$$
DROP PROCEDURE faceclass_migrar_001_web$$

DELIMITER ;
