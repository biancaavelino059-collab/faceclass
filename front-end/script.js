// ==========================================
// DADOS DOS ALUNOS
// ==========================================

let alunos = JSON.parse(localStorage.getItem("alunos")) || [];

// Recupera o aluno que está logado
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
    historico: []
};


// ==========================================
// SALVAR ALUNOS
// ==========================================

function salvarAlunos() {
    localStorage.setItem("alunos", JSON.stringify(alunos));
}


// ==========================================
// SALVAR ALUNO ATUAL
// ==========================================

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

    const jaExiste = alunos.some(a => a.ra === alunoAntigo.ra);

    if (!jaExiste) {
        alunos.push(alunoAntigo);
        salvarAlunos();
    }
}


// ==========================================
// ELEMENTOS DAS TELAS
// ==========================================

const telaLogin = document.getElementById("tela-login");
const telaCadastro = document.getElementById("tela-cadastro");
const telaFacial = document.getElementById("tela-facial");
const telaPrincipal = document.getElementById("tela-principal");


// ==========================================
// FUNÇÃO PARA TROCAR DE TELA
// ==========================================

function mostrarTela(tela) {

    telaLogin.classList.add("escondida");
    telaCadastro.classList.add("escondida");
    telaFacial.classList.add("escondida");
    telaPrincipal.classList.add("escondida");

    tela.classList.remove("escondida");
}


// ==========================================
// LOGIN
// ==========================================

document.getElementById("btn-login").addEventListener("click", () => {

    console.log("CLIQUEI NO BOTÃO ENTRAR");

    const ra =
        document.getElementById("login-ra").value.trim();

    const senha =
        document.getElementById("login-senha").value.trim();

    const mensagem =
        document.getElementById("mensagem-login");

    const formatoRA =
        /^0000[0-9]{9}[a-zA-Z0-9]$/;


    // Verificar campos vazios

    if (!ra || !senha) {

        mensagem.textContent =
            "Preencha o RA e a senha.";

        return;
    }


    // Verificar formato do RA

    if (!formatoRA.test(ra)) {

        mensagem.textContent =
            "O RA deve ter 14 caracteres e começar com 0000.";

        return;
    }


    // Procurar aluno pelo RA

    const alunoEncontrado =
        alunos.find(a => a.ra === ra);


    // ==========================================
    // PRIMEIRO ACESSO
    // ==========================================

    if (!alunoEncontrado) {

        localStorage.removeItem("alunoAtual");

        const ultimosQuatro =
            ra.slice(-4);


        // Senha do primeiro acesso

        if (senha !== ultimosQuatro) {

            mensagem.textContent =
                "No primeiro acesso, a senha deve ser os 4 últimos dígitos do RA.";

            return;
        }


        // Criar novo aluno

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
            historico: []
        };


        mensagem.textContent = "";

        mostrarTela(telaCadastro);

        return;
    }


    // ==========================================
    // ALUNO JÁ CADASTRADO
    // ==========================================

    if (senha !== alunoEncontrado.senha) {

        mensagem.textContent =
            "RA ou senha incorretos.";

        return;
    }


    // Definir aluno atual

    aluno = alunoEncontrado;

    if (!aluno.historico) {
        aluno.historico = [];
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


    // ==========================================
    // IR PARA TELA PRINCIPAL
    // ==========================================

    carregarTelaPrincipal();

    mostrarTela(telaPrincipal);

});


// ==========================================
// BOTÃO DE ATALHO PARA TESTES
// ==========================================

const btnTeste = document.getElementById("btn-teste");

if (btnTeste) {
    btnTeste.addEventListener("click", () => {
        const raTeste = "0000123456789A";

        // Procura se o aluno de teste já existe
        let alunoEncontrado = alunos.find(a => a.ra === raTeste);

        // Se não existir, cria o aluno de teste pronto para uso
        if (!alunoEncontrado) {
            alunoEncontrado = {
                nome: "Aluno de Teste",
                email: "teste@escola.com",
                ra: raTeste,
                senha: "1234",
                rostoCadastrado: true,
                rostoImagem: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                responsavel: {
                    nome: "Responsavel Teste",
                    telefone: "11999999999",
                    email: "responsavel@teste.com"
                },
                entrada: null,
                saida: null,
                historico: []
            };

            alunos.push(alunoEncontrado);
            salvarAlunos();
        }

        // Define como aluno atual
        aluno = alunoEncontrado;

        if (!aluno.historico) {
            aluno.historico = [];
        }

        salvarAlunoAtual();

        // Vai direto para a tela principal
        carregarTelaPrincipal();
        mostrarTela(telaPrincipal);
    });
}


// ==========================================
// CADASTRO
// ==========================================

document.getElementById("btn-cadastrar").addEventListener("click", () => {

    const nome =
        document.getElementById("cadastro-nome").value.trim();

    const email =
        document.getElementById("cadastro-email").value.trim();

    const ra =
        document.getElementById("cadastro-ra").value.trim();

    const senha =
        document.getElementById("cadastro-senha").value.trim();


    const responsavelNome =
        document.getElementById("responsavel-nome").value.trim();

    const responsavelTelefone =
        document.getElementById("responsavel-telefone").value.trim();

    const responsavelEmail =
        document.getElementById("responsavel-email").value.trim();


    // MENSAGEM

    const mensagem =
        document.getElementById("mensagem-cadastro");


    // ==========================================
    // VERIFICAR CAMPOS VAZIOS
    // ==========================================

    if (
        !nome ||
        !email ||
        !ra ||
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
    // VALIDAR NOME DO RESPONSÁVEL
    // ==========================================

    const formatoNomeResponsavel =
        /^[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)+$/;


    if (!formatoNomeResponsavel.test(responsavelNome)) {

        mensagem.textContent =
            "Digite o nome completo do responsável, usando apenas letras.";

        return;
    }


    // ==========================================
    // VALIDAR TELEFONE
    // ==========================================

    const formatoTelefone =
        /^\d{11}$/;


    if (!formatoTelefone.test(responsavelTelefone)) {

        mensagem.textContent =
            "Digite um telefone válido com 11 números.";

        return;
    }


    // ==========================================
    // VALIDAR E-MAIL
    // ==========================================

    const formatoEmail =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


    if (!formatoEmail.test(email)) {

        mensagem.textContent =
            "Digite um e-mail válido.";

        return;
    }


    if (!formatoEmail.test(responsavelEmail)) {

        mensagem.textContent =
            "Digite um e-mail válido para o responsável.";

        return;
    }


    // ==========================================
    // VALIDAR NOME DO ALUNO
    // ==========================================

    const formatoNome =
        /^[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)+$/;


    if (!formatoNome.test(nome)) {

        mensagem.textContent =
            "Digite seu nome completo, usando apenas letras.";

        return;
    }


    // ==========================================
    // VALIDAR RA
    // ==========================================

    const formatoRA =
        /^0000[0-9]{9}[a-zA-Z0-9]$/;


    if (!formatoRA.test(ra)) {

        mensagem.textContent =
            "O RA deve ter 14 caracteres e começar com 0000.";

        return;
    }


    // ==========================================
    // SALVAR DADOS DO ALUNO
    // ==========================================

    aluno.nome = nome;
    aluno.email = email;
    aluno.ra = ra;
    aluno.senha = senha;


    aluno.responsavel.nome =
        responsavelNome;

    aluno.responsavel.telefone =
        responsavelTelefone;

    aluno.responsavel.email =
        responsavelEmail;


    // ==========================================
    // ADICIONAR ALUNO À LISTA
    // ==========================================

    const alunoJaExiste =
        alunos.some(a => a.ra === aluno.ra);


    if (!alunoJaExiste) {

        alunos.push(aluno);

    } else {

        const indice =
            alunos.findIndex(a => a.ra === aluno.ra);

        alunos[indice] = aluno;
    }


    salvarAlunos();
    salvarAlunoAtual();


    mensagem.textContent = "";


    // ==========================================
    // IR PARA CADASTRO FACIAL
    // ==========================================

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


        // Verificar câmera

        if (!camera.srcObject) {

            mensagem.style.color =
                "#e5484d";

            mensagem.textContent =
                "A câmera ainda não foi ativada.";

            return;
        }


        // Verificar se a câmera iniciou

        if (camera.readyState < 2) {

            mensagem.style.color =
                "#e5484d";

            mensagem.textContent =
                "Aguarde a câmera iniciar.";

            return;
        }


        // Definir tamanho do canvas

        canvas.width =
            camera.videoWidth;

        canvas.height =
            camera.videoHeight;


        const contexto =
            canvas.getContext("2d");


        // Capturar imagem

        contexto.drawImage(
            camera,
            0,
            0,
            canvas.width,
            canvas.height
        );


        const imagemRosto =
            canvas.toDataURL("image/jpeg");


        // Salvar rosto

        aluno.rostoCadastrado = true;

        aluno.rostoImagem =
            imagemRosto;


        salvarAlunoAtual();


        mensagem.style.color =
            "#22a06b";

        mensagem.textContent =
            "Rosto capturado com sucesso!";


        // Ir para tela principal

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
    .addEventListener("click", () => {

        const mensagem =
            document.getElementById("mensagem-principal");


        // Verificar se já registrou entrada

        if (aluno.entrada) {

            mensagem.style.color =
                "#e5484d";

            mensagem.textContent =
                "Sua entrada já foi registrada hoje.";

            return;
        }


        // Verificar rosto

        if (!aluno.rostoCadastrado) {

            mensagem.style.color =
                "#e5484d";

            mensagem.textContent =
                "Você precisa cadastrar seu rosto primeiro.";

            return;
        }


        // Horário e Data atual

        const agora =
            new Date();

        const hora =
            String(agora.getHours()).padStart(2, "0");

        const minuto =
            String(agora.getMinutes()).padStart(2, "0");

        const horarioAtual =
            `${hora}:${minuto}`;

        const dataAtual =
            agora.toLocaleDateString("pt-BR");


        // ==========================================
        // VERIFICAR LOCALIZAÇÃO
        // ==========================================

        mensagem.style.color =
            "#777777";

        mensagem.textContent =
            "Verificando sua localização...";


        verificarLocalizacao((estaNaEscola) => {

            if (!estaNaEscola) {

                mensagem.style.color =
                    "#e5484d";

                mensagem.textContent =
                    "Você precisa estar na escola para registrar sua entrada.";

                return;
            }


            // Localização aprovada

            aluno.entrada = horarioAtual;

            if (!aluno.historico) {
                aluno.historico = [];
            }

            // Registra no histórico do aluno
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

        });

    });


// ==========================================
// REGISTRAR SAÍDA
// ==========================================

document
    .getElementById("btn-saida")
    .addEventListener("click", () => {

        const mensagem =
            document.getElementById("mensagem-principal");


        // Precisa ter entrada

        if (!aluno.entrada) {

            mensagem.style.color =
                "#e5484d";

            mensagem.textContent =
                "Você precisa registrar sua entrada primeiro.";

            return;
        }


        // Verificar se já registrou saída

        if (aluno.saida) {

            mensagem.style.color =
                "#e5484d";

            mensagem.textContent =
                "Sua saída já foi registrada hoje.";

            return;
        }


        // Horário e Data atual

        const agora =
            new Date();

        const hora =
            String(agora.getHours()).padStart(2, "0");

        const minuto =
            String(agora.getMinutes()).padStart(2, "0");

        const horarioAtual =
            `${hora}:${minuto}`;

        const dataAtual =
            agora.toLocaleDateString("pt-BR");


        mensagem.style.color =
            "#777777";

        mensagem.textContent =
            "Verificando sua localização...";


        // ==========================================
        // VERIFICAR LOCALIZAÇÃO
        // ==========================================

        verificarLocalizacao((estaNaEscola) => {

            if (!estaNaEscola) {

                mensagem.style.color =
                    "#e5484d";

                mensagem.textContent =
                    "Você precisa estar na escola para registrar sua saída.";

                return;
            }


            // Localização aprovada

            aluno.saida = horarioAtual;

            if (!aluno.historico) {
                aluno.historico = [];
            }

            // Registra no histórico do aluno
            aluno.historico.push({
                tipo: "Saída",
                hora: horarioAtual,
                data: dataAtual
            });

            salvarAlunoAtual();


            mensagem.style.color =
                "#22a06b";

            mensagem.textContent =
                `Saída registrada às ${horarioAtual}.`;


            atualizarStatus();

        });

    });


// ==========================================
// SAIR DA CONTA
// ==========================================

document
    .getElementById("btn-sair")
    .addEventListener("click", () => {

        localStorage.removeItem("alunoAtual");

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
            historico: []
        };

        mostrarTela(telaLogin);

    });


// ==========================================
// CÂMERA
// ==========================================

async function abrirCamera() {

    const camera =
        document.getElementById("camera");

    const mensagem =
        document.getElementById("mensagem-facial");


    try {

        const stream =
            await navigator.mediaDevices.getUserMedia({
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

    latitude: -23.4713832,

    longitude: -46.6351309,

    raio: 100

};


// ==========================================
// CALCULAR DISTÂNCIA ATÉ A ESCOLA
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
        lat1 * Math.PI / 180;

    const radLat2 =
        lat2 * Math.PI / 180;


    const diferencaLat =
        (lat2 - lat1) * Math.PI / 180;

    const diferencaLon =
        (lon2 - lon1) * Math.PI / 180;


    const a =
        Math.sin(diferencaLat / 2) *
        Math.sin(diferencaLat / 2) +

        Math.cos(radLat1) *
        Math.cos(radLat2) *

        Math.sin(diferencaLon / 2) *
        Math.sin(diferencaLon / 2);


    const c =
        2 * Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );


    return R * c;

}


// ==========================================
// VERIFICAR LOCALIZAÇÃO
// ==========================================

function verificarLocalizacao(callback) {

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


            if (distancia <= ESCOLA.raio) {

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
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }

    );

}


// ==========================================
// CARREGAR TELA PRINCIPAL
// ==========================================

function carregarTelaPrincipal() {

    document.getElementById("nome-aluno").textContent =
        aluno.nome;

    atualizarStatus();

}


// ==========================================
// ATUALIZAR STATUS E HISTÓRICO
// ==========================================

function atualizarStatus() {

    const statusEntrada =
        document.getElementById("status-entrada");

    const statusSaida =
        document.getElementById("status-saida");


    // ==========================================
    // STATUS DA ENTRADA
    // ==========================================

    if (aluno.entrada) {

        statusEntrada.textContent =
            `Registrada às ${aluno.entrada}`;

    } else {

        statusEntrada.textContent =
            "Ainda não registrada";

    }


    // ==========================================
    // STATUS DA SAÍDA
    // ==========================================

    if (aluno.saida) {

        statusSaida.textContent =
            `Registrada às ${aluno.saida}`;

    } else {

        statusSaida.textContent =
            "Ainda não registrada";

    }


    // ==========================================
    // HISTÓRICO DE REGISTROS (TODOS SALVOS)
    // ==========================================

    const listaHistorico = document.getElementById("lista-historico");

    if (listaHistorico) {
        if (aluno.historico && aluno.historico.length > 0) {
            listaHistorico.innerHTML = "";

            // Inverte para mostrar o mais recente no topo
            const historicoInvertido = [...aluno.historico].reverse();

            historicoInvertido.forEach(item => {
                const p = document.createElement("p");
                p.style.marginBottom = "8px";
                p.textContent = `${item.tipo} registrada em ${item.data} às ${item.hora}`;
                listaHistorico.appendChild(p);
            });
        } else {
            listaHistorico.innerHTML = "<p>Nenhum registro realizado.</p>";
        }
    }

}