import mysql.connector

def conectar():
    conexao = mysql.connector.connect(
        host="localhost",
        user="root",
        password="@Hugon26",
        database="faceclass"
    )

    return conexao