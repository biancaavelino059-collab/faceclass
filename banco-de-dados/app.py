import hmac
import hashlib
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
from emails import enfileirar, enviar_recuperacao
from facial import MODELO, ErroFacial, conferir, extrair, guardar

# Define a pasta do site e cria a aplicação Flask que recebe as requisições.
RAIZ = Path(__file__).resolve().parent.parent
app = Flask(
    __name__,
    static_folder=str(RAIZ / "front-end"),
    static_url_path="/front-end",
)
segredo = os.getenv("APP_SECRET", "")
# Impede iniciar o site sem a chave que protege as sessões dos usuários.
if len(segredo) < 32:
    raise RuntimeError("Configure APP_SECRET com uma chave aleatória no .env.")

# Ajusta cookies, tamanho máximo das requisições e duração da sessão.
app.config.update(
    SECRET_KEY=segredo,
    MAX_CONTENT_LENGTH=4 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("APP_HTTPS", "false").lower() == "true",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
)
FUSO = ZoneInfo("America/Sao_Paulo")
# Hash fictício evita uma resposta mais rápida quando o RA não existe.
HASH_INEXISTENTE = generate_password_hash(secrets.token_urlsafe(32))


# Exceção usada para devolver erros esperados da API com o status correto.
class ErroAPI(Exception):
    def __init__(self, mensagem, status=400):
        self.mensagem = mensagem
        self.status = status


# Converte erros de validação da API em respostas JSON.
@app.errorhandler(ErroAPI)
def erro_api(erro):
    return jsonify(erro=erro.mensagem), erro.status


# Converte erros de captura ou comparação facial em resposta compreensível.
@app.errorhandler(ErroFacial)
def erro_facial(erro):
    return jsonify(erro=str(erro)), 422


# Informa conflito quando o banco rejeita um cadastro ou registro duplicado.
@app.errorhandler(mysql.connector.IntegrityError)
def erro_integridade(erro):
    return jsonify(erro="Cadastro ou registro duplicado. Confira os dados."), 409


# Evita mostrar detalhes internos ao usuário e registra falhas no log do servidor.
@app.errorhandler(Exception)
def erro_geral(erro):
    if isinstance(erro, HTTPException):
        return jsonify(erro=erro.description), erro.code
    app.logger.error("Falha interna: %s", type(erro).__name__)
    return jsonify(erro="Não foi possível concluir. Tente novamente ou avise a equipe."), 503


# Evita que respostas da API com informações pessoais sejam guardadas em cache.
@app.after_request
def nao_cachear_dados(resposta):
    if request.path not in {"/"} and not request.path.startswith("/front-end/"):
        resposta.headers["Cache-Control"] = "no-store"
    return resposta


# Cria e devolve um token usado para proteger ações que alteram dados.
def csrf():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]


# Confere origem e token CSRF antes de aceitar operações que alteram informações.
@app.before_request
def proteger_requisicao():
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origem = request.headers.get("Origin")
        origem_local = request.host_url.rstrip("/")
        origens_permitidas = {
            item.strip().rstrip("/")
            for item in os.getenv("APP_ORIGENS_PERMITIDAS", "").split(",")
            if item.strip()
        }

        if origem:
            origem = origem.rstrip("/")
            if origem != origem_local and origem not in origens_permitidas:
                raise ErroAPI("Origem da requisição não permitida.", 403)

        recebido = request.headers.get("X-CSRF-Token", "")
        esperado = session.get("csrf", "")
        if not esperado or not recebido.isascii() or not hmac.compare_digest(recebido, esperado):
            raise ErroAPI("Sessão desatualizada. Recarregue a página.", 403)

# Protege rotas que só podem ser usadas após o aluno entrar na conta.
def autenticado(funcao):
    @wraps(funcao)
    def executar(*args, **kwargs):
        if not isinstance(session.get("aluno_id"), int):
            raise ErroAPI("Entre na sua conta para continuar.", 401)
        return funcao(*args, **kwargs)
    return executar


# Lê o corpo JSON da requisição e rejeita dados em formato inesperado.
def corpo_json():
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        raise ErroAPI("Envie um objeto JSON válido.")
    return dados


# Valida um campo textual, seu tamanho e caracteres de controle.
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


# Normaliza o RA para comparação consistente e rejeita formatos inválidos.
def ra_normalizado(dados):
    ra = texto(dados, "RA", 30).replace("-", "").replace(" ", "").upper()
    if not re.fullmatch(r"[0-9]{13}[0-9A-Z]", ra):
        raise ErroAPI("Informe 13 números e o dígito verificador, que pode ser letra ou número.")
    return ra


# Valida e padroniza o endereço de e-mail recebido pela API.
def email_validado(dados, campo):
    valor = texto(dados, campo, 120).lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", valor):
        raise ErroAPI(f"Informe um e-mail válido em {campo}.")
    return valor


# Confere se um campo é número finito e está dentro do intervalo permitido.
def numero(dados, campo, minimo, maximo):
    valor = dados.get(campo)
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        raise ErroAPI(f"Informe um número válido em {campo}.")
    if not minimo <= valor <= maximo or not math.isfinite(valor):
        raise ErroAPI(f"O campo {campo} está fora do intervalo permitido.")
    return float(valor)


# Calcula a distância aproximada, em metros, entre duas coordenadas GPS.
def distancia(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(min(1.0, max(0.0, a))))


# Valida GPS, precisão e distância em relação às coordenadas da escola.
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


# Seleciona apenas dados do aluno que podem ser devolvidos ao navegador.
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


# Busca os dados públicos do aluno e encerra a sessão se a conta não existir.
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


# Inicia uma sessão limpa para o aluno e prepara um novo token CSRF.
def iniciar_sessao(aluno_id):
    session.clear()
    session["aluno_id"] = aluno_id
    session.permanent = True
    return csrf()


# Entrega o arquivo inicial do site no endereço raiz.
@app.get("/")
def inicio():
    return send_file(RAIZ / "index.html")


# Faz uma consulta simples para confirmar que o servidor alcança o MySQL.
@app.get("/teste-banco")
def teste_banco():
    with transacao() as (_, cursor):
        cursor.execute("SELECT 1 AS ok")
        cursor.fetchone()
    return jsonify(mensagem="Conexão com o banco funcionando.")


# Informa ao site se há aluno conectado e entrega o token de proteção CSRF.
@app.get("/sessao")
def sessao_atual():
    token = csrf()
    aluno = None
    if session.get("aluno_id"):
        with transacao() as (_, cursor):
            aluno = buscar_aluno(cursor, session["aluno_id"])
    return jsonify(aluno=aluno, csrf_token=token)


# Valida os dados, grava o aluno e responsável e cria a sessão após o cadastro.
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
    # Guarda somente o hash da senha; a senha original não é salva no banco.
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


# Confere RA e senha e inicia uma sessão autenticada para o aluno.
@app.post("/login")
def login():
    dados = corpo_json()
    ra = ra_normalizado(dados)
    senha = texto(dados, "senha", 128, aparar=False)
    with transacao() as (_, cursor):
        cursor.execute("SELECT id, senha FROM aluno WHERE RA=%s", (ra,))
        linha = cursor.fetchone()

    # Usa um hash fictício quando o RA não existe para reduzir diferenças de tempo.
    hash_salvo = linha["senha"] if linha else HASH_INEXISTENTE
    if not hash_salvo.startswith(("scrypt:", "pbkdf2:")):
        raise ErroAPI("A equipe precisa executar a migração das senhas antigas.", 503)
    if not check_password_hash(hash_salvo, senha) or not linha:
        raise ErroAPI("RA ou senha incorretos.", 401)

    with transacao() as (_, cursor):
        aluno = buscar_aluno(cursor, linha["id"])
    token = iniciar_sessao(linha["id"])
    return jsonify(mensagem="Login realizado.", aluno=aluno, csrf_token=token)

@app.post("/recuperar-senha")
def solicitar_recuperacao_senha():
    dados = corpo_json()
    ra = ra_normalizado(dados)
    email = email_validado(dados, "email")
    envio = None

    with transacao() as (_, cursor):
        cursor.execute(
            "SELECT id, nome, email FROM aluno WHERE RA=%s AND email=%s",
            (ra, email),
        )
        aluno = cursor.fetchone()

        if aluno:
            token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

            # Um pedido novo invalida os links antigos ainda não usados.
            cursor.execute(
                """UPDATE recuperacao_senha
                   SET invalidado_em=UTC_TIMESTAMP()
                   WHERE aluno_id=%s
                     AND usado_em IS NULL
                     AND invalidado_em IS NULL""",
                (aluno["id"],),
            )

            cursor.execute(
                """INSERT INTO recuperacao_senha
                   (aluno_id, token_hash, expira_em, criado_em)
                   VALUES (
                       %s, %s,
                       DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE),
                       UTC_TIMESTAMP()
                   )""",
                (aluno["id"], token_hash),
            )
            token_id = cursor.lastrowid

            # Usa a URL pública configurada para que o e-mail sempre aponte
            # para o mesmo endereço do túnel aberto no celular.
            origem = os.getenv("APP_PUBLIC_URL", "").strip().rstrip("/")
            if not origem:
                origem = request.headers.get("Origin") or request.host_url
            link = f"{origem.rstrip('/')}/#redefinir={token}"

            envio = (aluno["email"], aluno["nome"], link, token_id)

    # Envia depois de concluir a transação do banco.
    if envio:
        try:
            enviar_recuperacao(envio[0], envio[1], envio[2])
        except Exception as erro:
            # Se o e-mail falhar, invalida o token e não registra o token
            # nem o endereço da pessoa no log.
            try:
                with transacao() as (_, cursor):
                    cursor.execute(
                        """UPDATE recuperacao_senha
                           SET invalidado_em=UTC_TIMESTAMP()
                           WHERE id=%s AND usado_em IS NULL""",
                        (envio[3],),
                    )
            except Exception as erro_banco:
                app.logger.error(
                    "Falha ao invalidar token de recuperação: %s",
                    type(erro_banco).__name__,
                )

            app.logger.error(
                "Falha ao enviar e-mail de recuperação: %s",
                type(erro).__name__,
            )

    # A mesma resposta é devolvida mesmo se RA/e-mail não corresponderem.
    return jsonify(
        mensagem=(
            "Se os dados estiverem corretos, enviamos um link "
            "de redefinição para o seu e-mail."
        )
    )

@app.post("/redefinir-senha")
def redefinir_senha():
    dados = corpo_json()
    token = texto(dados, "token", 200)
    senha = texto(dados, "senha", 128, 8, aparar=False)

    if len(senha.strip()) < 8:
        raise ErroAPI("A nova senha precisa ter pelo menos 8 caracteres.")

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    senha_hash = generate_password_hash(senha)

    with transacao() as (_, cursor):
        cursor.execute(
            """SELECT id, aluno_id
               FROM recuperacao_senha
               WHERE token_hash=%s
                 AND expira_em > UTC_TIMESTAMP()
                 AND usado_em IS NULL
                 AND invalidado_em IS NULL
               FOR UPDATE""",
            (token_hash,),
        )
        recuperacao = cursor.fetchone()

        if not recuperacao:
            raise ErroAPI(
                "Esse link é inválido ou expirou. Peça outro link de recuperação.",
                400,
            )

        cursor.execute(
            "UPDATE aluno SET senha=%s WHERE id=%s",
            (senha_hash, recuperacao["aluno_id"]),
        )

        cursor.execute(
            """UPDATE recuperacao_senha
               SET usado_em=UTC_TIMESTAMP()
               WHERE id=%s""",
            (recuperacao["id"],),
        )

        # Um link novo não deve continuar valendo depois da troca da senha.
        cursor.execute(
            """UPDATE recuperacao_senha
               SET invalidado_em=UTC_TIMESTAMP()
               WHERE aluno_id=%s
                 AND id<>%s
                 AND usado_em IS NULL
                 AND invalidado_em IS NULL""",
            (recuperacao["aluno_id"], recuperacao["id"]),
        )

    return jsonify(
        mensagem="Senha redefinida. Agora entre com a senha nova."
    )

# Encerra a sessão do aluno e cria um token CSRF para a próxima ação.
@app.post("/logout")
@autenticado
def logout():
    session.clear()
    return jsonify(mensagem="Você saiu da conta.", csrf_token=csrf())


# Captura o rosto da sessão atual, protege o modelo e salva o cadastro no banco.
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


# Registra entrada/saída após validar GPS, rosto, horário e regras do dia.
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

    # Primeiro obtém o cadastro facial necessário para verificar a captura.
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

    # Aplica a regra de justificativa quando a saída ocorre antes do horário previsto.
    agora = datetime.now(FUSO)
    horario_saida = time.fromisoformat(os.getenv("HORARIO_SAIDA", "12:10"))
    if tipo == "saida" and agora.time() < horario_saida and not motivo:
        raise ErroAPI("Informe o motivo da saída antecipada.", 422)

    # A gravação da presença e o enfileiramento do e-mail são confirmados juntos.
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


# Lista apenas o histórico do aluno autenticado, com no máximo 100 registros.
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


# Comando administrativo que converte senhas antigas em hashes seguros.
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


# Inicia o servidor local quando este arquivo é executado diretamente.
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
