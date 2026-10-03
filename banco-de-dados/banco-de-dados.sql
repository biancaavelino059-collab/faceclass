-- Somente para uma instalação NOVA. Não execute sobre um banco já em uso.
-- Para uma instalação existente, use migracoes/001_backend_web.sql após backup.
-- MySQL 8+, banco InnoDB. Não inclui usuários reais nem senhas de exemplo.
CREATE DATABASE faceclass CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE faceclass;

CREATE TABLE aluno (
    id INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    RA VARCHAR(20) NOT NULL,
    -- O backend armazena o hash da senha, não a senha em texto.
    senha VARCHAR(255) NOT NULL,
    email VARCHAR(120) NOT NULL,
    nome_responsavel VARCHAR(100) NOT NULL,
    -- Um responsável pode ter mais de um aluno.
    email_responsavel VARCHAR(120) NOT NULL,
    telefone_responsavel VARCHAR(20) NOT NULL,
    -- Template criptografado + identificação do modelo de reconhecimento.
    -- Um hash comum da fotografia não serve para comparar rostos diferentes.
    rosto_template LONGTEXT NULL,
    rosto_modelo VARCHAR(80) NULL,
    rosto_cadastrado_em DATETIME NULL,
    UNIQUE KEY uq_aluno_ra (RA),
    UNIQUE KEY uq_aluno_email (email),
    KEY idx_aluno_email_responsavel (email_responsavel)
) ENGINE=InnoDB;

CREATE TABLE presenca (
    id INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
    aluno_id INT NOT NULL,
    tipo ENUM('entrada', 'saida') NOT NULL,
    data DATE NOT NULL,
    horario TIME NOT NULL,
    latitude DECIMAL(10, 8) NULL,
    longitude DECIMAL(11, 8) NULL,
    validacao_facial BOOLEAN NOT NULL,
    motivo_saida VARCHAR(500) NULL,
    -- Regra atual da API: uma entrada e uma saída por aluno por dia.
    UNIQUE KEY uq_presenca_diaria (aluno_id, data, tipo),
    CONSTRAINT fk_presenca_aluno FOREIGN KEY (aluno_id) REFERENCES aluno(id)
) ENGINE=InnoDB;

CREATE TABLE notificacao_email (
    id BIGINT PRIMARY KEY AUTO_INCREMENT NOT NULL,
    presenca_id INT NOT NULL,
    destinatario VARCHAR(120) NOT NULL,
    assunto VARCHAR(200) NOT NULL,
    corpo TEXT NOT NULL,
    status ENUM('pendente', 'enviando', 'enviado', 'falhou') NOT NULL DEFAULT 'pendente',
    tentativas INT NOT NULL DEFAULT 0,
    -- O worker usa UTC nestes campos de controle.
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


