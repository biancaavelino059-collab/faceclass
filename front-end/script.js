// ==========================================
// DADOS DOS ALUNOS
// ==========================================

let alunos = JSON.parse(localStorage.getItem("alunos")) || [];

let aluno = JSON.parse(localStorage.getItem("alunoAtual")) || {
    nome: "",
    email: "",
    ra: "",
    senha: "",
    rostoCadastrado: false,
    rostoImagem: "",
    responsavel: {
        nome: "",
        telefone: "",
        email: ""
    },
    entrada: null,
    saida: null,
    motivoSaida: "",
    historico: []
};

function salvarAlunos() {
    localStorage.setItem("alunos", JSON.stringify(alunos));
}

function salvarAlunoAtual() {
    localStorage.setItem("alunoAtual", JSON.stringify(aluno));

    const indice = alunos.findIndex(a => a.ra === aluno.ra);

    if (indice !== -1) {
        alunos[indice] = aluno;
        salvarAlunos();
    }
}


// ==========================================
// IMPORTAR CADASTRO ANTIGO
// ==========================================

const alunoAntigo = JSON.parse(localStorage.getItem("aluno"));

if (alunoAntigo && alunoAntigo.ra) {

    const jaExiste = alunos.some(
        a => a.ra === alunoAntigo.ra
    );

    if (!jaExiste) {

        if (!alunoAntigo.historico) {
            alunoAntigo.historico = [];
        }

        if (alunoAntigo.motivoSaida === undefined) {
            alunoAntigo.motivoSaida = "";
        }

        alunos.push(alunoAntigo);
        salvarAlunos();
    }
}


// ==========================================
// ELEMENTOS DAS TELAS
// ==========================================

const telaLogin =
    document.getElementById("tela-login");

const telaCadastro =
    document.getElementById("tela-cadastro");

const telaFacial =
    document.getElementById("tela-facial");

const telaPrincipal =
    document.getElementById("tela-principal");


// ==========================================
// TROCAR DE TELA
// ==========================================

function mostrarTela(tela) {

    telaLogin.classList.add("escondida");
    telaCadastro.classList.add("escondida");
    telaFacial.classList.add("escondida");
    telaPrincipal.classList.add("escondida");

    tela.classList.remove("escondida");
}


// ==========================================
// FORMATAR RA
// ==========================================

function formatarRA(valor) {

    let numeros =
        valor.replace(/\D/g, "");

    numeros =
        numeros.slice(0, 14);

    if (numeros.length > 13) {

        return (
            numeros.slice(0, 13) +
            "-" +
            numeros.slice(13)
        );
    }

    return numeros;
}


const loginRa =
    document.getElementById("login-ra");

const cadastroRa =
    document.getElementById("cadastro-ra");


loginRa.addEventListener("input", function () {

    this.value =
        formatarRA(this.value);

});


cadastroRa.addEventListener("input", function () {

    this.value =
        formatarRA(this.value);

});


// ==========================================
// FORMATAR TELEFONE
// Formato: (11) 9 1234-5678
// ==========================================

const telefone =
    document.getElementById("responsavel-telefone");


telefone.addEventListener("input", () => {

    let numero =
        telefone.value.replace(/\D/g, "");

    numero =
        numero.slice(0, 11);


    if (numero.length <= 2) {

        telefone.value =
            numero ? `(${numero}` : "";

        return;
    }


    if (numero.length <= 3) {

        telefone.value =
            `(${numero.slice(0, 2)}) ${numero.slice(2)}`;

        return;
    }


    if (numero.length <= 7) {

        telefone.value =
            `(${numero.slice(0, 2)}) ${numero.slice(2, 3)} ${numero.slice(3)}`;

        return;
    }


    telefone.value =
        `(${numero.slice(0, 2)}) ${numero.slice(2, 3)} ${numero.slice(3, 7)}-${numero.slice(7)}`;

});


// ==========================================
// LOGIN
// ==========================================

document
    .getElementById("btn-login")
    .addEventListener("click", () => {

        const raFormatado =
            loginRa.value.trim();

        const senha =
            document
                .getElementById("login-senha")
                .value
                .trim();

        const mensagem =
            document
                .getElementById("mensagem-login");


        const ra =
            raFormatado.replace("-", "");


        const formatoRA =
            /^0000[0-9]{9}[a-zA-Z0-9]$/;


        if (!raFormatado || !senha) {

            mensagem.textContent =
                "Preencha o RA + dígito e a senha.";

            return;
        }


        if (!formatoRA.test(ra)) {

            mensagem.textContent =
                "Digite um RA válido no formato 0000000000000-0.";

            return;
        }


        const alunoEncontrado =
            alunos.find(
                a => a.ra === ra
            );


        // ==========================================
        // PRIMEIRO ACESSO
        // ==========================================

        if (!alunoEncontrado) {

            localStorage.removeItem(
                "alunoAtual"
            );


            const ultimosQuatro =
                ra.slice(-4);


            if (senha !== ultimosQuatro) {

                mensagem.textContent =
                    "No primeiro acesso, a senha deve ser os 4 últimos dígitos do RA.";

                return;
            }


            aluno = {

                nome: "",
                email: "",
                ra: ra,
                senha: "",

                rostoCadastrado: false,
                rostoImagem: "",

                responsavel: {
                    nome: "",
                    telefone: "",
                    email: ""
                },

                entrada: null,
                saida: null,
                motivoSaida: "",
                historico: []
            };


            cadastroRa.value =
                formatarRA(ra);


            mensagem.textContent = "";

            mostrarTela(telaCadastro);

            return;
        }


        // ==========================================
        // ALUNO JÁ CADASTRADO
        // ==========================================

        if (
            senha !==
            alunoEncontrado.senha
        ) {

            mensagem.textContent =
                "RA ou senha incorretos.";

            return;
        }


        aluno =
            alunoEncontrado;


        if (!aluno.historico) {
            aluno.historico = [];
        }


        if (aluno.motivoSaida === undefined) {
            aluno.motivoSaida = "";
        }


        salvarAlunoAtual();

        mensagem.textContent = "";


        // ==========================================
        // VERIFICAR ROSTO
        // ==========================================

        if (!aluno.rostoCadastrado) {

            mostrarTela(telaFacial);

            abrirCamera();

            return;
        }


        carregarTelaPrincipal();

        mostrarTela(telaPrincipal);

    });


// ==========================================
// BOTÃO DE TESTE
// ==========================================

const btnTeste =
    document.getElementById("btn-teste");


if (btnTeste) {

    btnTeste.addEventListener("click", () => {

        const raTeste =
            "0000123456789A";


        let alunoEncontrado =
            alunos.find(
                a => a.ra === raTeste
            );


        if (!alunoEncontrado) {

            alunoEncontrado = {

                nome: "Aluno de Teste",
                email: "teste@escola.com",
                ra: raTeste,
                senha: "1234",

                rostoCadastrado: true,
                rostoImagem: "",

                responsavel: {
                    nome: "Responsavel Teste",
                    telefone: "11999999999",
                    email: "responsavel@teste.com"
                },

                entrada: null,
                saida: null,
                motivoSaida: "",
                historico: []
            };


            alunos.push(alunoEncontrado);

            salvarAlunos();
        }


        if (!alunoEncontrado.historico) {
            alunoEncontrado.historico = [];
        }


        aluno =
            alunoEncontrado;


        salvarAlunoAtual();

        carregarTelaPrincipal();

        mostrarTela(telaPrincipal);

    });

}


// ==========================================
// CADASTRO
// ==========================================

document
    .getElementById("btn-cadastrar")
    .addEventListener("click", () => {

        const nome =
            document
                .getElementById("cadastro-nome")
                .value
                .trim();


        const email =
            document
                .getElementById("cadastro-email")
                .value
                .trim();


        const raFormatado =
            cadastroRa.value.trim();


        const senha =
            document
                .getElementById("cadastro-senha")
                .value
                .trim();


        const responsavelNome =
            document
                .getElementById("responsavel-nome")
                .value
                .trim();


        const responsavelTelefone =
            document
                .getElementById("responsavel-telefone")
                .value
                .trim();


        const responsavelEmail =
            document
                .getElementById("responsavel-email")
                .value
                .trim();


        const mensagem =
            document
                .getElementById("mensagem-cadastro");


        const ra =
            raFormatado.replace("-", "");


        // ==========================================
        // CAMPOS VAZIOS
        // ==========================================

        if (
            !nome ||
            !email ||
            !raFormatado ||
            !senha ||
            !responsavelNome ||
            !responsavelTelefone ||
            !responsavelEmail
        ) {

            mensagem.textContent =
                "Preencha todos os campos.";

            return;
        }


        // ==========================================
        // NOME
        // ==========================================

        const formatoNome =
            /^[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)+$/;


        if (!formatoNome.test(nome)) {

            mensagem.textContent =
                "Digite seu nome completo, usando apenas letras.";

            return;
        }


        if (
            !formatoNome.test(
                responsavelNome
            )
        ) {

            mensagem.textContent =
                "Digite o nome completo do responsável, usando apenas letras.";

            return;
        }


        // ==========================================
        // TELEFONE
        // ==========================================

        const formatoTelefone =
            /^\(\d{2}\) 9 \d{4}-\d{4}$/;


        if (
            !formatoTelefone.test(
                responsavelTelefone
            )
        ) {

            mensagem.textContent =
                "Digite um telefone válido no formato (11) 9 1234-5678.";

            return;
        }


        // ==========================================
        // E-MAIL
        // ==========================================

        const formatoEmail =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (
            !formatoEmail.test(email)
        ) {

            mensagem.textContent =
                "Digite um e-mail válido.";

            return;
        }


        if (
            !formatoEmail.test(
                responsavelEmail
            )
        ) {

            mensagem.textContent =
                "Digite um e-mail válido para o responsável.";

            return;
        }


        // ==========================================
        // RA
        // ==========================================

        const formatoRA =
            /^0000[0-9]{9}[a-zA-Z0-9]$/;


        if (
            !formatoRA.test(ra)
        ) {

            mensagem.textContent =
                "Digite um RA válido no formato 0000000000000-0.";

            return;
        }


        // ==========================================
        // SALVAR DADOS
        // ==========================================

        aluno.nome =
            nome;

        aluno.email =
            email;

        aluno.ra =
            ra;

        aluno.senha =
            senha;


        if (!aluno.responsavel) {
            aluno.responsavel = {};
        }


        aluno.responsavel.nome =
            responsavelNome;

        aluno.responsavel.telefone =
            responsavelTelefone;

        aluno.responsavel.email =
            responsavelEmail;


        if (!aluno.historico) {
            aluno.historico = [];
        }


        const indice =
            alunos.findIndex(
                a => a.ra === aluno.ra
            );


        if (indice === -1) {

            alunos.push(aluno);

        } else {

            alunos[indice] =
                aluno;
        }


        salvarAlunos();

        salvarAlunoAtual();


        mensagem.textContent = "";


        mostrarTela(telaFacial);

        abrirCamera();

    });


// ==========================================
// CADASTRO FACIAL
// ==========================================

document
    .getElementById("btn-cadastrar-facial")
    .addEventListener("click", () => {

        const camera =
            document.getElementById("camera");


        const canvas =
            document.getElementById("canvas-rosto");


        const mensagem =
            document.getElementById("mensagem-facial");


        if (!camera.srcObject) {

            mensagem.style.color =
                "#e5484d";

            mensagem.textContent =
                "A câmera ainda não foi ativada.";

            return;
        }


        if (camera.readyState < 2) {

            mensagem.style.color =
                "#e5484d";

            mensagem.textContent =
                "Aguarde a câmera iniciar.";

            return;
        }


        canvas.width =
            camera.videoWidth;


        canvas.height =
            camera.videoHeight;


        const contexto =
            canvas.getContext("2d");


        contexto.drawImage(
            camera,
            0,
            0,
            canvas.width,
            canvas.height
        );


        aluno.rostoCadastrado =
            true;


        aluno.rostoImagem =
            canvas.toDataURL("image/jpeg");


        salvarAlunoAtual();


        mensagem.style.color =
            "#22a06b";


        mensagem.textContent =
            "Rosto capturado com sucesso!";


        setTimeout(() => {

            carregarTelaPrincipal();

            mostrarTela(telaPrincipal);

        }, 1000);

    });


// ==========================================
// REGISTRAR ENTRADA
// ==========================================

document
    .getElementById("btn-entrada")
    .addEventListener("click", function () {

        const btnEntrada = this;

        const mensagem =
            document.getElementById(
                "mensagem-principal"
            );


        if (aluno.entrada) {

            mensagem.style.color =
                "#e5484d";

            mensagem.textContent =
                "Sua entrada já foi registrada hoje.";

            return;
        }


        if (!aluno.rostoCadastrado) {

            mensagem.style.color =
                "#e5484d";

            mensagem.textContent =
                "Você precisa cadastrar seu rosto primeiro.";

            return;
        }


        const agora =
            new Date();


        const hora =
            String(
                agora.getHours()
            ).padStart(2, "0");


        const minuto =
            String(
                agora.getMinutes()
            ).padStart(2, "0");


        const horarioAtual =
            `${hora}:${minuto}`;


        const dataAtual =
            agora.toLocaleDateString("pt-BR");


        mensagem.style.color =
            "#777";


        mensagem.textContent =
            "Verificando sua localização...";

        btnEntrada.disabled = true;

        verificarLocalizacao(
            (estaNaEscola) => {

                if (!estaNaEscola) {

                    mensagem.style.color =
                        "#e5484d";

                    mensagem.textContent =
                        "Você precisa estar na escola para registrar sua entrada.";

                    btnEntrada.disabled = false;

                    return;
                }


                aluno.entrada =
                    horarioAtual;


                if (!aluno.historico) {
                    aluno.historico = [];
                }


                aluno.historico.push({

                    tipo: "Entrada",
                    hora: horarioAtual,
                    data: dataAtual

                });


                salvarAlunoAtual();


                mensagem.style.color =
                    "#22a06b";


                mensagem.textContent =
                    `Entrada registrada às ${horarioAtual}.`;


                atualizarStatus();

            }
        );

    });


// ==========================================
// REGISTRAR SAÍDA
// ==========================================

document
    .getElementById("btn-saida")
    .addEventListener("click", () => {

        const mensagem =
            document.getElementById(
                "mensagem-principal"
            );


        if (!aluno.entrada) {

            mensagem.style.color =
                "#e5484d";

            mensagem.textContent =
                "Você precisa registrar sua entrada primeiro.";

            return;
        }


        if (aluno.saida) {

            mensagem.style.color =
                "#e5484d";

            mensagem.textContent =
                "Sua saída já foi registrada hoje.";

            return;
        }


        const agora =
            new Date();


        const hora =
            agora.getHours();


        const minuto =
            agora.getMinutes();


        // Saída antes das 12:10
        // exige motivo

        if (
            hora < 12 ||
            (
                hora === 12 &&
                minuto < 10
            )
        ) {

            const campoMotivo =
                document.getElementById(
                    "campo-motivo-saida"
                );


            campoMotivo.classList.remove(
                "escondida"
            );


            mensagem.style.color =
                "#e5484d";


            mensagem.textContent =
                "A saída antes das 12:10 exige um motivo.";

            return;
        }


        registrarSaida();

    });


// ==========================================
// CONFIRMAR SAÍDA ANTECIPADA
// ==========================================

document
    .getElementById("btn-confirmar-saida")
    .addEventListener("click", () => {

        const motivo =
            document
                .getElementById("motivo-saida")
                .value
                .trim();


        const mensagem =
            document.getElementById(
                "mensagem-principal"
            );


        if (!motivo) {

            mensagem.style.color =
                "#e5484d";


            mensagem.textContent =
                "Digite o motivo da saída antecipada.";

            return;
        }


        registrarSaida(motivo);

    });


// ==========================================
// REGISTRAR SAÍDA
// ==========================================

function registrarSaida(
    motivo = ""
) {

    const btnSaida =
        document.getElementById("btn-saida");

    const btnConfirmarSaida =
        document.getElementById("btn-confirmar-saida");

    const mensagem =
        document.getElementById(
            "mensagem-principal"
        );


    const agora =
        new Date();


    const hora =
        String(
            agora.getHours()
        ).padStart(2, "0");


    const minuto =
        String(
            agora.getMinutes()
        ).padStart(2, "0");


    const horarioAtual =
        `${hora}:${minuto}`;


    const dataAtual =
        agora.toLocaleDateString("pt-BR");


    mensagem.style.color =
        "#777";


    mensagem.textContent =
        "Verificando sua localização...";

    if (btnSaida) btnSaida.disabled = true;
    if (btnConfirmarSaida) btnConfirmarSaida.disabled = true;


    verificarLocalizacao(
        (estaNaEscola) => {

            if (!estaNaEscola) {

                mensagem.style.color =
                    "#e5484d";


                mensagem.textContent =
                    "Você precisa estar na escola para registrar sua saída.";

                if (btnSaida) btnSaida.disabled = false;
                if (btnConfirmarSaida) btnConfirmarSaida.disabled = false;

                return;
            }


            aluno.saida =
                horarioAtual;


            aluno.motivoSaida =
                motivo;


            if (!aluno.historico) {
                aluno.historico = [];
            }


            aluno.historico.push({

                tipo: "Saída",
                hora: horarioAtual,
                data: dataAtual,
                motivo: motivo

            });


            salvarAlunoAtual();


            document
                .getElementById(
                    "campo-motivo-saida"
                )
                .classList.add(
                    "escondida"
                );


            document
                .getElementById(
                    "motivo-saida"
                )
                .value = "";


            mensagem.style.color =
                "#22a06b";


            mensagem.textContent =
                `Saída registrada às ${horarioAtual}.`;


            atualizarStatus();

        }
    );

}


// ==========================================
// SAIR DA CONTA
// ==========================================

document
    .getElementById("btn-sair")
    .addEventListener("click", () => {

        localStorage.removeItem(
            "alunoAtual"
        );


        aluno = {

            nome: "",
            email: "",
            ra: "",
            senha: "",

            rostoCadastrado: false,
            rostoImagem: "",

            responsavel: {
                nome: "",
                telefone: "",
                email: ""
            },

            entrada: null,
            saida: null,
            motivoSaida: "",
            historico: []

        };


        document.getElementById(
            "login-ra"
        ).value = "";


        document.getElementById(
            "login-senha"
        ).value = "";


        document.getElementById(
            "mensagem-login"
        ).textContent = "";


        mostrarTela(telaLogin);

    });


// ==========================================
// CÂMERA
// ==========================================

async function abrirCamera() {

    const camera =
        document.getElementById(
            "camera"
        );


    const mensagem =
        document.getElementById(
            "mensagem-facial"
        );


    try {

        const stream =
            await navigator
                .mediaDevices
                .getUserMedia({

                    video: {
                        facingMode: "user"
                    },

                    audio: false

                });


        camera.srcObject =
            stream;


        mensagem.style.color =
            "#22a06b";


        mensagem.textContent =
            "Câmera ativada. Posicione seu rosto.";

    } catch (erro) {

        console.error(
            "Erro ao acessar câmera:",
            erro
        );


        mensagem.style.color =
            "#e5484d";


        mensagem.textContent =
            "Não foi possível acessar sua câmera. Permita o acesso para continuar.";

    }

}


// ==========================================
// LOCALIZAÇÃO DA ESCOLA
// ==========================================

const ESCOLA = {

    latitude:
        -23.4713832,

    longitude:
        -46.6351309,

    raio:
        100

};


// ==========================================
// CALCULAR DISTÂNCIA
// ==========================================

function calcularDistancia(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R =
        6371e3;


    const radLat1 =
        lat1 *
        Math.PI /
        180;


    const radLat2 =
        lat2 *
        Math.PI /
        180;


    const diferencaLat =
        (
            lat2 -
            lat1
        ) *
        Math.PI /
        180;


    const diferencaLon =
        (
            lon2 -
            lon1
        ) *
        Math.PI /
        180;


    const a =
        Math.sin(
            diferencaLat / 2
        ) *
        Math.sin(
            diferencaLat / 2
        ) +

        Math.cos(radLat1) *
        Math.cos(radLat2) *

        Math.sin(
            diferencaLon / 2
        ) *
        Math.sin(
            diferencaLon / 2
        );


    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );


    return R * c;

}


// ==========================================
// VERIFICAR LOCALIZAÇÃO
// ==========================================

function verificarLocalizacao(
    callback
) {

    if (!navigator.geolocation) {

        callback(false);

        return;
    }


    navigator.geolocation.getCurrentPosition(

        (posicao) => {

            const latitude =
                posicao.coords.latitude;


            const longitude =
                posicao.coords.longitude;


            const distancia =
                calcularDistancia(

                    latitude,
                    longitude,

                    ESCOLA.latitude,
                    ESCOLA.longitude

                );


            console.log(
                "Distância até a escola:",
                Math.round(distancia),
                "metros"
            );


            if (
                distancia <=
                ESCOLA.raio
            ) {

                callback(true);

            } else {

                callback(false);

            }

        },


        (erro) => {

            console.error(
                "Erro ao obter localização:",
                erro
            );


            callback(false);

        },


        {

            enableHighAccuracy:
                true,

            timeout:
                10000,

            maximumAge:
                0

        }

    );

}


// ==========================================
// CARREGAR TELA PRINCIPAL
// ==========================================

function carregarTelaPrincipal() {

    document
        .getElementById(
            "nome-aluno"
        )
        .textContent =
        aluno.nome ||
        "Aluno";


    atualizarStatus();

}


// ==========================================
// ATUALIZAR STATUS E HISTÓRICO
// ==========================================

function atualizarStatus() {

    const statusEntrada =
        document.getElementById(
            "status-entrada"
        );


    const statusSaida =
        document.getElementById(
            "status-saida"
        );

    const btnEntrada =
        document.getElementById(
            "btn-entrada"
        );

    const btnSaida =
        document.getElementById(
            "btn-saida"
        );


    // ==========================================
    // ENTRADA
    // ==========================================

    if (aluno.entrada) {

        statusEntrada.textContent =
            `Registrada às ${aluno.entrada}`;

        if (btnEntrada) btnEntrada.disabled = true;

    } else {

        statusEntrada.textContent =
            "Ainda não registrada";

        if (btnEntrada) btnEntrada.disabled = false;

    }


    // ==========================================
    // SAÍDA
    // ==========================================

    if (aluno.saida) {

        statusSaida.textContent =
            `Registrada às ${aluno.saida}`;

        if (btnSaida) btnSaida.disabled = true;

    } else {

        statusSaida.textContent =
            "Ainda não registrada";

        if (btnSaida) btnSaida.disabled = false;

    }


    // ==========================================
    // HISTÓRICO COMPLETO
    // ==========================================

    const listaHistorico =
        document.getElementById(
            "lista-historico"
        );


    if (listaHistorico) {

        if (
            aluno.historico &&
            aluno.historico.length > 0
        ) {

            listaHistorico.innerHTML = "";


            const historicoInvertido =
                [
                    ...aluno.historico
                ].reverse();


            historicoInvertido.forEach(
                item => {

                    const p =
                        document.createElement(
                            "p"
                        );


                    p.style.marginBottom =
                        "8px";


                    let texto = `${item.tipo} registrada em ${item.data} às ${item.hora}`;

                    if (item.motivo) {
                        texto += ` (Motivo: ${item.motivo})`;
                    }

                    p.textContent = texto;


                    listaHistorico.appendChild(
                        p
                    );

                }
            );

        } else {

            listaHistorico.innerHTML =
                "<p>Nenhum registro realizado.</p>";

        }

    }

}