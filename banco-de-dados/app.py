import hmac
import math
import os
import re
import secrets
from datetime import datetime, time, timedelta
from functools import wraps
from pathlib import Path
from zoneinfo import ZoneInfo

import click
import mysql.connector
from flask import Flask, jsonify, request, send_file, session
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from banco import transacao
from emails import enfileirar
from facial import MODELO, ErroFacial, conferir, extrair, guardar

RAIZ = Path(__file__).resolve().parent.parent
app = Flask(
    __name__,
    static_folder=str(RAIZ / "front-end"),
    static_url_path="/front-end",
)
segredo = os.getenv("APP_SECRET", "")
if len(segredo) < 32:
    raise RuntimeError("Configure APP_SECRET com uma chave aleatória no .env.")

app.config.update(
    SECRET_KEY=segredo,
    MAX_CONTENT_LENGTH=4 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("APP_HTTPS", "false").lower() == "true",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
)
FUSO = ZoneInfo("America/Sao_Paulo")
HASH_INEXISTENTE = generate_password_hash(secrets.token_urlsafe(32))


class ErroAPI(Exception):
    def __init__(self, mensagem, status=400):
        self.mensagem = mensagem
        self.status = status


@app.errorhandler(ErroAPI)
def erro_api(erro):
    return jsonify(erro=erro.mensagem), erro.status


@app.errorhandler(ErroFacial)
def erro_facial(erro):
    return jsonify(erro=str(erro)), 422


@app.errorhandler(mysql.connector.IntegrityError)
def erro_integridade(erro):
    return jsonify(erro="Cadastro ou registro duplicado. Confira os dados."), 409


@app.errorhandler(Exception)
def erro_geral(erro):
    if isinstance(erro, HTTPException):
        return jsonify(erro=erro.description), erro.code
    app.logger.error("Falha interna: %s", type(erro).__name__)
    return jsonify(erro="Não foi possível concluir. Tente novamente ou avise a equipe."), 503


@app.after_request
def nao_cachear_dados(resposta):
    if request.path not in {"/"} and not request.path.startswith("/front-end/"):
        resposta.headers["Cache-Control"] = "no-store"
    return resposta


def csrf():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]


@app.before_request
def proteger_requisicao():
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origem = request.headers.get("Origin")
        if origem and origem.rstrip("/") != request.host_url.rstrip("/"):
            raise ErroAPI("Origem da requisição não permitida.", 403)
        recebido = request.headers.get("X-CSRF-Token", "")
        esperado = session.get("csrf", "")
        if not esperado or not recebido.isascii() or not hmac.compare_digest(recebido, esperado):
            raise ErroAPI("Sessão desatualizada. Recarregue a página.", 403)


def autenticado(funcao):
    @wraps(funcao)
    def executar(*args, **kwargs):
        if not isinstance(session.get("aluno_id"), int):
            raise ErroAPI("Entre na sua conta para continuar.", 401)
        return funcao(*args, **kwargs)
    return executar


def corpo_json():
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        raise ErroAPI("Envie um objeto JSON válido.")
    return dados


def texto(dados, campo, limite, minimo=1, aparar=True):
    valor = dados.get(campo)
    if not isinstance(valor, str):
        raise ErroAPI(f"Preencha o campo {campo}.")
    if aparar:
        valor = valor.strip()
    if re.search(r"[\x00-\x1f\x7f]", valor):
        raise ErroAPI(f"O campo {campo} contém caracteres inválidos.")
    if not minimo <= len(valor) <= limite:
        raise ErroAPI(f"O campo {campo} deve ter de {minimo} a {limite} caracteres.")
    return valor


def ra_normalizado(dados):
    ra = texto(dados, "RA", 30).replace("-", "").replace(" ", "").upper()
    if not re.fullmatch(r"[0-9A-Z]{5,20}", ra):
        raise ErroAPI("Informe um RA válido, sem pontos ou símbolos.")
    return ra


def email_validado(dados, campo):
    valor = texto(dados, campo, 120).lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", valor):
        raise ErroAPI(f"Informe um e-mail válido em {campo}.")
    return valor


def numero(dados, campo, minimo, maximo):
    valor = dados.get(campo)
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        raise ErroAPI(f"Informe um número válido em {campo}.")
    if not minimo <= valor <= maximo or not math.isfinite(valor):
        raise ErroAPI(f"O campo {campo} está fora do intervalo permitido.")
    return float(valor)


def distancia(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(min(1.0, max(0.0, a))))


def validar_local(dados):
    latitude = numero(dados, "latitude", -90, 90)
    longitude = numero(dados, "longitude", -180, 180)
    precisao = numero(dados, "precisao", 0, 100000)
    escola_lat = float(os.environ["ESCOLA_LATITUDE"])
    escola_lon = float(os.environ["ESCOLA_LONGITUDE"])
    raio = float(os.getenv("ESCOLA_RAIO_METROS", "100"))
    precisao_maxima = float(os.getenv("GPS_PRECISAO_MAX_METROS", "100"))
    if (
        not all(math.isfinite(v) for v in (escola_lat, escola_lon, raio, precisao_maxima))
        or not -90 <= escola_lat <= 90
        or not -180 <= escola_lon <= 180
        or not 0 < raio <= 100000
        or not 0 < precisao_maxima <= 100000
    ):
        raise RuntimeError("Confira coordenadas, raio e precisão da escola no .env.")
    if precisao > precisao_maxima:
        raise ErroAPI("Localização imprecisa. Tente novamente com o GPS ativado.", 422)
    if distancia(latitude, longitude, escola_lat, escola_lon) > raio:
        raise ErroAPI("Você precisa estar na escola para registrar entrada ou saída.", 403)
    return latitude, longitude


def aluno_publico(linha):
    return {
        "id": linha["id"],
        "nome": linha["nome"],
        "RA": linha["RA"],
        "email": linha["email"],
        "rosto_cadastrado": bool(linha["rosto_cadastrado"]),
        "responsavel": {
            "nome": linha["nome_responsavel"],
            "email": linha["email_responsavel"],
            "telefone": str(linha["telefone_responsavel"]),
        },
    }


def buscar_aluno(cursor, aluno_id):
    cursor.execute(
        """SELECT id, nome, RA, email, nome_responsavel,
                  email_responsavel, telefone_responsavel,
                  (rosto_template IS NOT NULL) AS rosto_cadastrado
           FROM aluno WHERE id=%s""",
        (aluno_id,),
    )
    linha = cursor.fetchone()
    if not linha:
        session.clear()
        raise ErroAPI("Sua conta não foi encontrada. Entre novamente.", 401)
    return aluno_publico(linha)


def iniciar_sessao(aluno_id):
    session.clear()
    session["aluno_id"] = aluno_id
    session.permanent = True
    return csrf()


@app.get("/")
def inicio():
    return send_file(RAIZ / "index.html")


@app.get("/teste-banco")
def teste_banco():
    with transacao() as (_, cursor):
        cursor.execute("SELECT 1 AS ok")
        cursor.fetchone()
    return jsonify(mensagem="Conexão com o banco funcionando.")


@app.get("/sessao")
def sessao_atual():
    token = csrf()
    aluno = None
    if session.get("aluno_id"):
        with transacao() as (_, cursor):
            aluno = buscar_aluno(cursor, session["aluno_id"])
    return jsonify(aluno=aluno, csrf_token=token)


@app.post("/alunos")
def cadastrar_aluno():
    dados = corpo_json()
    nome = texto(dados, "nome", 100, 3)
    ra = ra_normalizado(dados)
    senha = texto(dados, "senha", 128, 8, aparar=False)
    if len(senha.strip()) < 8:
        raise ErroAPI("Crie uma senha com pelo menos 8 caracteres.")
    email = email_validado(dados, "email")
    responsavel = texto(dados, "nome_responsavel", 100, 3)
    email_responsavel = email_validado(dados, "email_responsavel")
    telefone = re.sub(r"\D", "", texto(dados, "telefone_responsavel", 30))
    if len(telefone) not in {10, 11}:
        raise ErroAPI("Informe um telefone com DDD.")
    hash_senha = generate_password_hash(senha)

    with transacao() as (_, cursor):
        cursor.execute(
            """INSERT INTO aluno
               (nome, RA, senha, email, nome_responsavel,
                email_responsavel, telefone_responsavel)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (nome, ra, hash_senha, email, responsavel, email_responsavel, telefone),
        )
        aluno_id = cursor.lastrowid
        aluno = buscar_aluno(cursor, aluno_id)

    token = iniciar_sessao(aluno_id)
    return jsonify(mensagem="Cadastro realizado.", aluno=aluno, csrf_token=token), 201


@app.post("/login")
def login():
    dados = corpo_json()
    ra = ra_normalizado(dados)
    senha = texto(dados, "senha", 128, aparar=False)
    with transacao() as (_, cursor):
        cursor.execute("SELECT id, senha FROM aluno WHERE RA=%s", (ra,))
        linha = cursor.fetchone()

    hash_salvo = linha["senha"] if linha else HASH_INEXISTENTE
    if not hash_salvo.startswith(("scrypt:", "pbkdf2:")):
        raise ErroAPI("A equipe precisa executar a migração das senhas antigas.", 503)
    if not check_password_hash(hash_salvo, senha) or not linha:
        raise ErroAPI("RA ou senha incorretos.", 401)

    with transacao() as (_, cursor):
        aluno = buscar_aluno(cursor, linha["id"])
    token = iniciar_sessao(linha["id"])
    return jsonify(mensagem="Login realizado.", aluno=aluno, csrf_token=token)


@app.post("/logout")
@autenticado
def logout():
    session.clear()
    return jsonify(mensagem="Você saiu da conta.", csrf_token=csrf())


@app.post("/rosto")
@autenticado
def cadastrar_rosto():
    dados = corpo_json()
    vetor = extrair(dados.get("imagem"))
    template = guardar(vetor)
    with transacao() as (_, cursor):
        cursor.execute(
            "SELECT rosto_template FROM aluno WHERE id=%s FOR UPDATE",
            (session["aluno_id"],),
        )
        aluno = cursor.fetchone()
        if not aluno:
            raise ErroAPI("Conta não encontrada.", 401)
        if aluno["rosto_template"]:
            raise ErroAPI("O rosto já foi cadastrado. Peça à equipe para atualizar.", 409)
        cursor.execute(
            """UPDATE aluno
               SET rosto_template=%s, rosto_modelo=%s, rosto_cadastrado_em=%s
               WHERE id=%s""",
            (template, MODELO, datetime.now(FUSO).replace(tzinfo=None),
             session["aluno_id"]),
        )
    return jsonify(mensagem="Rosto cadastrado.", rosto_cadastrado=True), 201


@app.post("/presenca")
@autenticado
def registrar_presenca():
    dados = corpo_json()
    tipo = dados.get("tipo")
    if not isinstance(tipo, str) or tipo not in {"entrada", "saida"}:
        raise ErroAPI("O tipo deve ser entrada ou saida.")
    latitude, longitude = validar_local(dados)
    motivo = dados.get("motivo_saida", "")
    if not isinstance(motivo, str) or len(motivo) > 500:
        raise ErroAPI("O motivo da saída deve ter até 500 caracteres.")
    motivo = motivo.strip()
    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", motivo):
        raise ErroAPI("O motivo contém caracteres inválidos.")

    with transacao() as (_, cursor):
        cursor.execute(
            "SELECT rosto_template, rosto_modelo FROM aluno WHERE id=%s",
            (session["aluno_id"],),
        )
        cadastro = cursor.fetchone()
    if not cadastro:
        raise ErroAPI("Conta não encontrada.", 401)
    if not conferir(dados.get("imagem"), cadastro["rosto_template"], cadastro["rosto_modelo"]):
        raise ErroAPI("O rosto não corresponde ao cadastro. Tente novamente.", 403)

    agora = datetime.now(FUSO)
    horario_saida = time.fromisoformat(os.getenv("HORARIO_SAIDA", "12:10"))
    if tipo == "saida" and agora.time() < horario_saida and not motivo:
        raise ErroAPI("Informe o motivo da saída antecipada.", 422)

    with transacao() as (_, cursor):
        cursor.execute(
            """SELECT nome, email_responsavel, rosto_template
               FROM aluno WHERE id=%s FOR UPDATE""",
            (session["aluno_id"],),
        )
        aluno = cursor.fetchone()
        if not aluno:
            raise ErroAPI("Conta não encontrada.", 401)
        if aluno["rosto_template"] != cadastro["rosto_template"]:
            raise ErroAPI("O cadastro facial mudou. Tente novamente.", 409)

        cursor.execute(
            "SELECT tipo FROM presenca WHERE aluno_id=%s AND data=%s",
            (session["aluno_id"], agora.date()),
        )
        tipos = {registro["tipo"] for registro in cursor.fetchall()}
        if tipo in tipos:
            raise ErroAPI(f"Sua {tipo} já foi registrada hoje.", 409)
        if tipo == "saida" and "entrada" not in tipos:
            raise ErroAPI("Registre a entrada antes da saída.", 409)

        cursor.execute(
            """INSERT INTO presenca
               (aluno_id, tipo, data, horario, latitude, longitude,
                validacao_facial, motivo_saida)
               VALUES (%s, %s, %s, %s, %s, %s, 1, %s)""",
            (session["aluno_id"], tipo, agora.date(), agora.time().replace(microsecond=0),
             latitude, longitude, motivo if tipo == "saida" else None),
        )
        presenca_id = cursor.lastrowid
        enfileirar(cursor, presenca_id, aluno["email_responsavel"],
                   aluno["nome"], tipo, agora, motivo if tipo == "saida" else "")

    return jsonify(
        mensagem=("Entrada" if tipo == "entrada" else "Saída") + " registrada.",
        presenca={
            "id": presenca_id,
            "tipo": tipo,
            "data": agora.date().isoformat(),
            "horario": agora.strftime("%H:%M:%S"),
            "motivo_saida": motivo if tipo == "saida" else None,
        },
        notificacao="pendente",
    ), 201


@app.get("/presencas")
@app.get("/presencas/<int:aluno_id>")
@autenticado
def listar_presencas(aluno_id=None):
    atual = session["aluno_id"]
    if aluno_id is not None and aluno_id != atual:
        raise ErroAPI("Você não pode consultar outro aluno.", 403)

    with transacao() as (_, cursor):
        cursor.execute(
            """SELECT p.id, p.tipo, p.data, p.horario, p.motivo_saida,
                      n.status AS notificacao
               FROM presenca p
               LEFT JOIN notificacao_email n ON n.presenca_id=p.id
               WHERE p.aluno_id=%s
               ORDER BY p.data DESC, p.horario DESC, p.id DESC LIMIT 100""",
            (atual,),
        )
        registros = cursor.fetchall()

    for registro in registros:
        registro["data"] = str(registro["data"])
        registro["horario"] = str(registro["horario"])
    return jsonify(presencas=registros, hoje=datetime.now(FUSO).date().isoformat())


@app.cli.command("migrar-senhas")
def migrar_senhas():
    total = 0
    with transacao() as (_, cursor):
        cursor.execute("SELECT id, senha FROM aluno FOR UPDATE")
        alunos = cursor.fetchall()
        for aluno in alunos:
            if not aluno["senha"].startswith(("scrypt:", "pbkdf2:")):
                cursor.execute(
                    "UPDATE aluno SET senha=%s WHERE id=%s",
                    (generate_password_hash(aluno["senha"]), aluno["id"]),
                )
                total += 1
    click.echo(f"{total} senha(s) antigas convertidas para hash.")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
