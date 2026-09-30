create schema faceclass character set utf8mb4 collate utf8mb4_general_ci;
use faceclass;

create table aluno (
	id INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    RA VARCHAR(20) NOT NULL UNIQUE,
    senha VARCHAR(4) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
	nome_responsavel VARCHAR(100) NOT NULL,
    email_responsavel VARCHAR(120) NOT NULL UNIQUE,
    telefone_responsavel DECIMAL(11) NOT NULL UNIQUE
);

create table presenca (
	id INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
    aluno_id INT NOT NULL,
    tipo ENUM('entrada', 'saida') NOT NULL,
    data DATE NOT NULL,
    horario TIME NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    validacao_facial BOOLEAN  NOT NULL,
    
FOREIGN KEY (aluno_id) REFERENCES aluno(id)
);

insert into aluno (nome, RA, senha, email, nome_responsavel, email_responsavel, telefone_responsavel)
VALUES ('Lavínia', '1094029385sp', '9385', '00001094029385sp@educacao.sp.gov.br', 'Camila', 'camila123@gmail.com', '11976862158');

SELECT * FROM aluno;


