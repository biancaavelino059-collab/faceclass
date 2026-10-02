import os
from contextlib import contextmanager
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv

BASE = Path(__file__).resolve().parent
load_dotenv(BASE / ".env")


def conectar():
    senha = os.getenv("DB_PASSWORD")
    usuario = os.getenv("DB_USER")
    if senha is None or not usuario:
        raise RuntimeError("Configure DB_USER e DB_PASSWORD no arquivo .env.")

    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=usuario,
        password=senha,
        database=os.getenv("DB_NAME", "faceclass"),
        connection_timeout=5,
        autocommit=False,
    )


@contextmanager
def transacao():
    conexao = conectar()
    cursor = None
    try:
        cursor = conexao.cursor(dictionary=True)
        yield conexao, cursor
        conexao.commit()
    except Exception:
        conexao.rollback()
        raise
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()
