"""Configura e testa a conexão local sem alterar usuários ou dados do MySQL."""

import getpass
import os
from pathlib import Path
import warnings

import mysql.connector
from dotenv import dotenv_values, set_key

from configurar import preparar_env

BASE = Path(__file__).resolve().parent
ENV = BASE / ".env"


def perguntar(rotulo, padrao=""):
    dica = f" [{padrao}]" if padrao else ""
    return input(f"{rotulo}{dica}: ").strip() or padrao


def coletar_configuracao():
    valores = dotenv_values(ENV, interpolate=False)
    usuario = valores.get("DB_USER") or os.getenv("DB_USER", "")
    if usuario == "USUARIO_DO_MYSQL":
        usuario = ""
    configuracao = {
        "DB_HOST": perguntar("Servidor", valores.get("DB_HOST") or "127.0.0.1"),
        "DB_PORT": perguntar("Porta", valores.get("DB_PORT") or "3306"),
        "DB_NAME": perguntar("Nome do banco", valores.get("DB_NAME") or "faceclass"),
        "DB_USER": perguntar("Usuario do MySQL", usuario),
    }
    if not configuracao["DB_USER"]:
        raise ValueError("Informe um usuário existente no MySQL.")
    if not 1 <= int(configuracao["DB_PORT"]) <= 65535:
        raise ValueError("A porta deve estar entre 1 e 65535.")
    print("A senha não aparece enquanto você digita.")
    with warnings.catch_warnings():
        # Se o terminal não conseguir esconder a senha, não usar entrada visível.
        warnings.simplefilter("error", getpass.GetPassWarning)
        configuracao["DB_PASSWORD"] = getpass.getpass(
            "Senha do MySQL (Enter para testar sem senha): "
        )
    return configuracao


def testar_conexao(configuracao):
    conexao = mysql.connector.connect(
        host=configuracao["DB_HOST"],
        port=int(configuracao["DB_PORT"]),
        user=configuracao["DB_USER"],
        password=configuracao["DB_PASSWORD"],
        connection_timeout=5,
        autocommit=False,
    )
    try:
        cursor = conexao.cursor()
        try:
            cursor.execute(
                "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA "
                "WHERE SCHEMA_NAME=%s",
                (configuracao["DB_NAME"],),
            )
            return cursor.fetchone() is not None
        finally:
            cursor.close()
    finally:
        conexao.close()


def salvar_configuracao(configuracao):
    for chave in ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"):
        set_key(str(ENV), chave, configuracao[chave], quote_mode="always")


def main():
    print("FaceClass - configurar MySQL neste computador")
    print("Enter mantém os valores entre colchetes. Gmail pode ficar para depois.")
    try:
        preparar_env()
        configuracao = coletar_configuracao()
        banco_disponivel = testar_conexao(configuracao)
        salvar_configuracao(configuracao)
    except mysql.connector.Error as erro:
        if erro.errno == 1045:
            print("O MySQL recusou este usuário/senha. A configuração anterior foi preservada.")
            print("Senha vazia só funciona se a conta do MySQL já estiver configurada sem senha.")
        elif erro.errno in {2002, 2003, 2005}:
            print("Não foi possível alcançar o MySQL. Confira o serviço, o servidor e a porta.")
        else:
            print(f"O teste do MySQL falhou (código {erro.errno}).")
        return 1
    except (ValueError, OSError, getpass.GetPassWarning):
        print("Configuração não concluída. Confira os campos e use um terminal local.")
        return 1
    except (KeyboardInterrupt, EOFError):
        print("\nConfiguração cancelada.")
        return 1
    print("Acesso ao MySQL confirmado. Dados salvos apenas no .env local.")
    if not banco_disponivel:
        print("A base escolhida ainda não está disponível para este usuário.")
        print("Prepare o SQL com a equipe do banco ou ajuste as permissões no Workbench.")
    print("Abra iniciar-site.cmd; se o site já estava aberto, feche e reabra a janela dele.")
    print("O e-mail não é necessário para iniciar o site.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
