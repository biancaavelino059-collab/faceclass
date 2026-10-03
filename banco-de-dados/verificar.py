"""Diagnóstico local sem revelar senhas, chaves ou dados de alunos."""
import os
from pathlib import Path
import sys

import mysql.connector
from cryptography.fernet import Fernet
from banco import conectar
from emails import validar_configuracao

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


def validar_metadados(tabelas, colunas, indices, chaves):
    """Confere a estrutura sem ler dados de alunos, senhas ou presenças."""
    falhas = []
    engines = {linha["TABLE_NAME"]: linha["ENGINE"] for linha in tabelas}
    campos = {}
    for linha in colunas:
        campos.setdefault(linha["TABLE_NAME"], {})[linha["COLUMN_NAME"].lower()] = linha
    for tabela, esperados in CAMPOS.items():
        if engines.get(tabela) != "InnoDB":
            falhas.append(f"Tabela {tabela} precisa existir e usar InnoDB.")
        if not {campo.lower() for campo in esperados} <= set(campos.get(tabela, {})):
            falhas.append(f"Tabela {tabela} precisa da migração SQL (faltam campos).")

    # Colunas de identificação precisam manter o tipo das chaves relacionadas.
    for tabela, campo, tipo, auto_increment in (
        ("aluno", "id", "int", True), ("presenca", "id", "int", True),
        ("presenca", "aluno_id", "int", False),
        ("notificacao_email", "id", "bigint", True),
        ("notificacao_email", "presenca_id", "int", False),
    ):
        linha = campos.get(tabela, {}).get(campo)
        if linha and (linha["DATA_TYPE"] != tipo or linha["IS_NULLABLE"] != "NO"
                      or "unsigned" in linha["COLUMN_TYPE"].lower()
                      or (auto_increment and "auto_increment" not in linha["EXTRA"].lower())):
            falhas.append(f"Campo {tabela}.{campo} precisa das propriedades corretas.")
    for campo, tipos, tamanho, nullable in (
        ("senha", {"char", "varchar"}, 255, "NO"),
        ("telefone_responsavel", {"char", "varchar"}, 20, "NO"),
        ("rosto_template", {"longtext"}, None, "YES"),
    ):
        linha = campos.get("aluno", {}).get(campo)
        if linha and (linha["DATA_TYPE"] not in tipos or linha["IS_NULLABLE"] != nullable
                      or (tamanho and (linha["CHARACTER_MAXIMUM_LENGTH"] or 0) < tamanho)):
            falhas.append(f"Campo aluno.{campo} tem formato diferente do necessário.")

    agrupados = {}
    for linha in indices:
        agrupados.setdefault((linha["TABLE_NAME"], linha["INDEX_NAME"]), []).append(linha)

    def indice_unico(tabela, nomes, primario=False):
        for (origem, nome_indice), partes in agrupados.items():
            if origem != tabela or (primario and nome_indice != "PRIMARY"):
                continue
            partes = sorted(partes, key=lambda linha: linha["SEQ_IN_INDEX"])
            if all(linha["NON_UNIQUE"] == 0 and linha["SUB_PART"] is None for linha in partes):
                presentes = tuple((linha["COLUMN_NAME"] or "").lower() for linha in partes)
                if len(presentes) == len(nomes) and set(presentes) == {nome.lower() for nome in nomes}:
                    return True
        return False

    for tabela in CAMPOS:
        if not indice_unico(tabela, ("id",), primario=True):
            falhas.append(f"Tabela {tabela} precisa de chave primária somente em id.")
    for tabela, nomes in (("aluno", ("RA",)), ("aluno", ("email",)),
                          ("presenca", ("aluno_id", "data", "tipo")),
                          ("notificacao_email", ("presenca_id",))):
        if not indice_unico(tabela, nomes):
            falhas.append(f"Tabela {tabela} precisa de índice único em {', '.join(nomes)}.")

    vinculos = {}
    for linha in chaves:
        vinculos.setdefault((linha["TABLE_NAME"], linha["CONSTRAINT_NAME"]), []).append(linha)
    for tabela, campo, destino in (("presenca", "aluno_id", "aluno"),
                                   ("notificacao_email", "presenca_id", "presenca")):
        valido = any(
            origem == tabela and len(partes) == 1
            and partes[0]["COLUMN_NAME"].lower() == campo
            and partes[0]["REFERENCED_TABLE_NAME"] == destino
            and partes[0]["REFERENCED_COLUMN_NAME"].lower() == "id"
            and partes[0]["REFERENCIA_LOCAL"] == 1
            for (origem, _), partes in vinculos.items()
        )
        if not valido:
            falhas.append(f"Tabela {tabela} precisa vincular {campo} a {destino}.id neste banco.")
    return falhas


def verificar_schema(cursor):
    """Consulta apenas metadados do banco selecionado na conexão."""
    consultas = (
        "SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()",
        "SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE,"
        "CHARACTER_MAXIMUM_LENGTH,EXTRA FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA=DATABASE()",
        "SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART "
        "FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()",
        "SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,"
        "REFERENCED_COLUMN_NAME,REFERENCED_TABLE_SCHEMA=DATABASE() AS REFERENCIA_LOCAL "
        "FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() "
        "AND REFERENCED_TABLE_NAME IS NOT NULL",
    )
    snapshots = []
    for consulta in consultas:
        cursor.execute(consulta)
        snapshots.append(cursor.fetchall())
    return validar_metadados(*snapshots)


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
            cursor = conexao.cursor(dictionary=True)
            try:
                falhas.extend(verificar_schema(cursor))
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
    try:
        validar_configuracao()
    except (RuntimeError, ValueError):
        print("E-mail pode ficar para depois: envio não configurado; avisos ficam pendentes.")
    else:
        print("SMTP configurado. Inicie iniciar-emails.cmd para processar os avisos.")
    if falhas:
        return 1
    print("Configuração essencial pronta. Teste câmera/GPS no navegador.")
    return 0


if __name__ == "__main__":
    raise SystemExit(verificar())
