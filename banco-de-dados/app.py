from flask import Flask, jsonify, request
from banco import conectar

app = Flask(__name__)


@app.route("/")
def inicio():
    return "API do FaceClass funcionando!"


@app.route("/teste-banco")
def teste_banco():
    conexao = conectar()

    if conexao.is_connected():
        conexao.close()
        return "Conexão com o banco FaceClass funcionando!"

    return "Erro na conexão com o banco"


@app.route("/alunos")
def listar_alunos():
    conexao = conectar()
    cursor = conexao.cursor(dictionary=True)

    cursor.execute("SELECT * FROM aluno")

    alunos = cursor.fetchall()

    cursor.close()
    conexao.close()

    return jsonify(alunos)


@app.route("/alunos", methods=["POST"])
def cadastrar_aluno():

    dados = request.get_json()

    conexao = conectar()
    cursor = conexao.cursor()

    sql = """
        INSERT INTO aluno
        (nome, RA, senha, email, nome_responsavel, email_responsavel, telefone_responsavel)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """

    valores = (
        dados["nome"],
        dados["RA"],
        dados["senha"],
        dados["email"],
        dados["nome_responsavel"],
        dados["email_responsavel"],
        dados["telefone_responsavel"]
    )

    cursor.execute(sql, valores)
    conexao.commit()

    cursor.close()
    conexao.close()

    return jsonify({
        "mensagem": "Aluno cadastrado com sucesso!"
    }), 201


@app.route("/login", methods=["POST"])
def login():

    dados = request.get_json()

    RA = dados["RA"]
    senha = dados["senha"]

    conexao = conectar()
    cursor = conexao.cursor(dictionary=True)

    sql = """
        SELECT id, nome, RA, email
        FROM aluno
        WHERE RA = %s AND senha = %s
    """

    cursor.execute(sql, (RA, senha))

    aluno = cursor.fetchone()

    cursor.close()
    conexao.close()

    if aluno:
        return jsonify({
            "mensagem": "Login realizado com sucesso!",
            "aluno": aluno
        })

    return jsonify({
        "erro": "RA ou senha incorretos."
    }), 401


if __name__ == "__main__":
    app.run(debug=True)