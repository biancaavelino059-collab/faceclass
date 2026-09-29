// ==========================================
// DADOS TEMPORÁRIOS DO ALUNO
// ==========================================

let aluno = {
    nome: "",
    email: "",
    ra: "",
    senha: "",

    rostoCadastrado: false,

    responsavel: {
        nome: "",
        telefone: "",
        email: ""
    },

    entrada: null,
    saida: null
};


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

    const ra = document.getElementById("login-ra").value.trim();
    const senha = document.getElementById("login-senha").value.trim();

    const mensagem = document.getElementById("mensagem-login");
    const formatoRA = /^0000[0-9]{9}[a-zA-Z0-9]$/;

if (!formatoRA.test(ra)) {

    mensagem.textContent =
        "O RA deve ter 14 caracteres e começar com 0000.";

    return;
}

    if (!ra || !senha) {
        mensagem.textContent = "Preencha o RA e a senha.";
        return;
    }

    if (ra.length < 4) {
        mensagem.textContent = "Digite um RA válido.";
        return;
    }

    const ultimosQuatro = ra.slice(-4);

    // Primeiro acesso
    if (!aluno.ra) {

        if (senha !== ultimosQuatro) {
            mensagem.textContent =
                "No primeiro acesso, a senha deve ser os 4 últimos dígitos do RA.";
            return;
        }

        aluno.ra = ra;

        mensagem.textContent = "";

        mostrarTela(telaCadastro);

        return;
    }

    // Acesso de aluno já cadastrado
    if (ra !== aluno.ra || senha !== aluno.senha) {

        mensagem.textContent =
            "RA ou senha incorretos.";

        return;
    }

    mensagem.textContent = "";

    carregarTelaPrincipal();

    mostrarTela(telaPrincipal);
});


// ==========================================
// CADASTRO
// ==========================================

document.getElementById("btn-cadastrar").addEventListener("click", () => {

    const nome = document.getElementById("cadastro-nome").value.trim();
    const email = document.getElementById("cadastro-email").value.trim();
    const ra = document.getElementById("cadastro-ra").value.trim();
    const senha = document.getElementById("cadastro-senha").value.trim();

    const responsavelNome =
        document.getElementById("responsavel-nome").value.trim();
    
    const formatoNomeResponsavel =
    /^[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)+$/;

if (!formatoNomeResponsavel.test(responsavelNome)) {

    mensagem.textContent =
        "Digite o nome completo do responsável, usando apenas letras.";

    return;
}

    const responsavelTelefone =
        document.getElementById("responsavel-telefone").value.trim();
        

    const responsavelEmail =
        document.getElementById("responsavel-email").value.trim();

    const mensagem =
        document.getElementById("mensagem-cadastro");

    const formatoTelefone = /^\d{11}$/;

if (!formatoTelefone.test(responsavelTelefone)) {

    mensagem.textContent =
        "Digite um telefone válido com 11 números.";

    return;
}

    const formatoEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!formatoEmail.test(email)) {

    mensagem.textContent =
        "Digite um e-mail válido.";

    return;
}


    // VALIDAR NOME

    const formatoNome =
        /^[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)+$/;

    if (!formatoNome.test(nome)) {

        mensagem.textContent =
            "Digite seu nome completo, usando apenas letras.";

        return;
    }


    // VALIDAR RA

    const formatoRA =
        /^0000[0-9]{9}[a-zA-Z0-9]$/;

    if (!formatoRA.test(ra)) {

        mensagem.textContent =
            "O RA deve ter 14 caracteres e começar com 0000.";

        return;
    }


    // VERIFICAR CAMPOS VAZIOS

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


    // SALVAR DADOS

    aluno.nome = nome;
    aluno.email = email;
    aluno.ra = ra;
    aluno.senha = senha;

    aluno.responsavel.nome = responsavelNome;
    aluno.responsavel.telefone = responsavelTelefone;
    aluno.responsavel.email = responsavelEmail;


    mensagem.textContent = "";

    mostrarTela(telaFacial);

    abrirCamera();
});

// ==========================================
// CADASTRO FACIAL
// ==========================================

document.getElementById("btn-cadastrar-facial").addEventListener("click", () => {

    const camera = document.getElementById("camera");
    const canvas = document.getElementById("canvas-rosto");
    const mensagem = document.getElementById("mensagem-facial");

    if (!camera.srcObject) {
        mensagem.style.color = "#e5484d";
        mensagem.textContent =
            "A câmera ainda não foi ativada.";
        return;
    }

    if (camera.readyState < 2) {
        mensagem.style.color = "#e5484d";
        mensagem.textContent =
            "Aguarde a câmera iniciar.";
        return;
    }

    canvas.width = camera.videoWidth;
    canvas.height = camera.videoHeight;

    const contexto = canvas.getContext("2d");

    contexto.drawImage(
        camera,
        0,
        0,
        canvas.width,
        canvas.height
    );

    const imagemRosto = canvas.toDataURL("image/jpeg");

    aluno.rostoCadastrado = true;
    aluno.rostoImagem = imagemRosto;

    mensagem.style.color = "#22a06b";
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

document.getElementById("btn-entrada").addEventListener("click", () => {

    const mensagem =
        document.getElementById("mensagem-principal");


    if (aluno.entrada) {

        mensagem.style.color = "#e5484d";

        mensagem.textContent =
            "Sua entrada já foi registrada hoje.";

        return;
    }


    if (!aluno.rostoCadastrado) {

        mensagem.style.color = "#e5484d";

        mensagem.textContent =
            "Você precisa cadastrar seu rosto primeiro.";

        return;
    }


    const agora = new Date();

    const hora = String(agora.getHours()).padStart(2, "0");
    const minuto = String(agora.getMinutes()).padStart(2, "0");

    const horarioAtual = `${hora}:${minuto}`;




    // Verificar localização
    mensagem.style.color = "#777777";

    mensagem.textContent =
        "Verificando sua localização...";


    verificarLocalizacao((estaNaEscola) => {

        if (!estaNaEscola) {

            mensagem.style.color = "#e5484d";

            mensagem.textContent =
                "Você precisa estar na escola para registrar sua entrada.";

            return;
        }


        // Localização aprovada
        aluno.entrada = horarioAtual;

        mensagem.style.color = "#22a06b";

        mensagem.textContent =
            `Entrada registrada às ${horarioAtual}.`;

        atualizarStatus();

    });

});


// ==========================================
// SAIR DA CONTA
// ==========================================

document.getElementById("btn-sair").addEventListener("click", () => {

    mostrarTela(telaLogin);

});
// ==========================================
// CÂMERA
// ==========================================

async function abrirCamera() {

    const camera = document.getElementById("camera");
    const mensagem = document.getElementById("mensagem-facial");

    try {

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user"
            },
            audio: false
        });

        camera.srcObject = stream;

        mensagem.style.color = "#22a06b";
        mensagem.textContent = "Câmera ativada. Posicione seu rosto.";

    } catch (erro) {

        console.error("Erro ao acessar câmera:", erro);

        mensagem.style.color = "#e5484d";
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

function calcularDistancia(lat1, lon1, lat2, lon2) {

    const R = 6371e3;

    const radLat1 = lat1 * Math.PI / 180;
    const radLat2 = lat2 * Math.PI / 180;

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