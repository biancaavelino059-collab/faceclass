"""Diagnóstico local sem revelar senhas, chaves ou dados de alunos."""
import os
from pathlib import Path
import sys

import mysql.connector
from cryptography.fernet import Fernet
from banco import conectar

BASE = Path(__file__).resolve().parent
CAMPOS = {
    "aluno": {"id", "nome", "RA", "senha", "email", "nome_responsavel",
              "email_responsavel", "telefone_responsavel", "rosto_template",
              "rosto_modelo", "rosto_cadastrado_em"},
    "presenca": {"id", "aluno_id", "tipo", "data", "horario", "latitude",
                 "longitude", "validacao_facial", "motivo_saida"},
    "notificacao_email": {"id", "presenca_id", "destinatario", "assunto", "corpo",
                         "status", "tentativas", "proxima_tentativa", "reserva_token",
                         "reservado_ate", "criado_em", "enviado_em", "ultimo_erro"},
}


def verificar():
    falhas = []
    if not (BASE / ".env").is_file():
        falhas.append(".env ausente: execute preparar-ambiente.cmd.")
    if len(os.getenv("APP_SECRET", "")) < 32 or "COLE_" in os.getenv("APP_SECRET", ""):
        falhas.append("Preencha APP_SECRET com a chave local gerada.")
    try:
        Fernet(os.getenv("FACE_ENCRYPTION_KEY", "").encode("ascii"))
    except Exception:
        falhas.append("FACE_ENCRYPTION_KEY ausente ou inválida.")
    for modelo in ("face_detection_yunet_2023mar.onnx",
                   "face_recognition_sface_2021dec.onnx"):
        if not (BASE / "modelos" / modelo).is_file():
            falhas.append(f"Modelo ausente: {modelo}. Execute preparar-ambiente.cmd.")
    try:
        conexao = conectar()
        try:
            cursor = conexao.cursor()
            try:
                cursor.execute(
                    "SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA=DATABASE()"
                )
                existentes = {}
                for tabela, campo in cursor.fetchall():
                    existentes.setdefault(tabela, set()).add(campo)
                for tabela, esperados in CAMPOS.items():
                    if not esperados <= existentes.get(tabela, set()):
                        falhas.append(f"Tabela {tabela} precisa da migração SQL.")
                print("MySQL: conexão funcionando.")
            finally:
                cursor.close()
        finally:
            conexao.close()
    except mysql.connector.Error as erro:
        causas = {
            1045: "usuário/senha do MySQL não aceitos; confira o .env local",
            1049: "base ausente; prepare o banco no Workbench",
            2003: "servidor indisponível; confira MySQL80 e porta",
        }
        causa = causas.get(erro.errno, "confira o serviço e a configuração local")
        falhas.append(f"MySQL: erro {erro.errno}; {causa}.")
    except Exception as erro:
        falhas.append(f"Configuração do banco incompleta ({type(erro).__name__}).")
    for falha in falhas:
        print("PENDENTE:", falha)
    if not os.getenv("SMTP_HOST") or not os.getenv("SMTP_FROM"):
        print("AVISO: SMTP não configurado; e-mails continuarão na fila.")
    if falhas:
        return 1
    print("Configuração essencial pronta. Teste câmera/GPS no navegador.")
    return 0


if __name__ == "__main__":
    raise SystemExit(verificar())
