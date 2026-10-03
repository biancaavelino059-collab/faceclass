"use strict";

// Dados pessoais, senhas e fotos não são persistidos no navegador.
// O backend é a autoridade para sessão, reconhecimento, localização e horário.
const porId = (id) => document.getElementById(id);
const estado = {
    aluno: null,
    csrf: "",
    historico: [],
    hoje: null,
    historicoCarregado: false,
    sessaoConhecida: false,
    ocupado: false,
    tela: "tela-login",
    acaoFacial: null,
    stream: null,
    cameraVersao: 0,
    cameraPronta: false,
};
let consultaHistorico = null;

class ErroRequisicao extends Error {
    constructor(mensagem, status = 0) {
        super(mensagem);
        this.status = status;
    }
}

function mensagem(id, texto = "", tipo = "erro") {
    const elemento = porId(id);
    elemento.textContent = texto;
    elemento.style.color = tipo === "sucesso" ? "var(--success)"
        : tipo === "info" ? "var(--subtext)" : "var(--danger)";
}

function normalizarRA(valor) {
    return valor.replace(/[-\s]/g, "").toUpperCase();
}

function validarRA(valor) {
    const ra = normalizarRA(valor);
    if (!/^[0-9A-Z]{5,20}$/.test(ra)) {
        throw new Error("Informe um RA com 5 a 20 letras ou números, incluindo o dígito.");
    }
    return ra;
}

// Cookies da sessão são HttpOnly; o token CSRF vem de GET /sessao.
async function api(caminho, dados) {
    const controlador = new AbortController();
    const limite = setTimeout(() => controlador.abort(), 45000);
    let resposta;
    try {
        resposta = await fetch(caminho, {
            method: dados === undefined ? "GET" : "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: dados === undefined ? { Accept: "application/json" } : {
                Accept: "application/json",
                "Content-Type": "application/json",
                "X-CSRF-Token": estado.csrf,
            },
            body: dados === undefined ? undefined : JSON.stringify(dados),
            signal: controlador.signal,
        });
        const retorno = await resposta.json().catch(() => null);
        if (!retorno || typeof retorno !== "object" || Array.isArray(retorno)) {
            throw new ErroRequisicao(
                "O servidor respondeu em um formato inesperado. Confira se o novo backend está rodando.",
                resposta.status,
            );
        }
        if (typeof retorno.csrf_token === "string") estado.csrf = retorno.csrf_token;
        if (!resposta.ok) {
            if (resposta.status === 401 && estado.aluno) {
                limparSessao();
                mensagem("mensagem-login", "Sua sessão terminou. Entre novamente.");
            }
            if (resposta.status === 404 && caminho === "/sessao") {
                throw new ErroRequisicao(
                    "O novo backend ainda não está pronto: falta a rota /sessao. Conclua o código da API.",
                    404,
                );
            }
            throw new ErroRequisicao(retorno.erro || "Não foi possível concluir a operação.", resposta.status);
        }
        return retorno;
    } catch (erro) {
        if (erro instanceof ErroRequisicao) throw erro;
        throw new ErroRequisicao(erro.name === "AbortError"
            ? "O servidor demorou para responder. Atualize os registros antes de tentar novamente."
            : "Não foi possível conectar. Abra o site pelo servidor e confira se o backend está ligado.");
    } finally {
        clearTimeout(limite);
    }
}

function pararCamera() {
    estado.cameraVersao += 1;
    estado.cameraPronta = false;
    if (estado.stream) estado.stream.getTracks().forEach((track) => track.stop());
    estado.stream = null;
    const camera = porId("camera");
    if (camera.srcObject) {
        camera.srcObject.getTracks().forEach((track) => track.stop());
        camera.srcObject = null;
    }
    // Apaga o frame técnico após uso; não mantém uma foto no canvas.
    porId("canvas-rosto").width = 0;
    porId("canvas-rosto").height = 0;
}

function mostrarTela(id) {
    if (id !== "tela-facial") pararCamera();
    ["tela-login", "tela-cadastro", "tela-facial", "tela-principal"].forEach((tela) => {
        porId(tela).classList.toggle("escondida", tela !== id);
    });
    estado.tela = id;
    atualizarBotoes();
}

function registrosHoje() {
    return estado.historico.filter((registro) => registro.data === estado.hoje);
}

function atualizarBotoes() {
    const bloqueado = estado.ocupado;
    ["btn-login", "btn-cadastrar"].forEach((id) => {
        porId(id).disabled = bloqueado || !estado.sessaoConhecida;
    });
    ["btn-primeiro-acesso", "btn-voltar-login", "btn-atualizar-login",
        "btn-sair", "btn-cancelar-facial", "btn-reabrir-camera",
        "btn-atualizar", "btn-confirmar-saida"].forEach((id) => {
        porId(id).disabled = bloqueado;
    });
    porId("btn-cadastrar-facial").disabled = bloqueado || !estado.cameraPronta;
    const registros = registrosHoje();
    const entrada = registros.some((registro) => registro.tipo === "entrada");
    const saida = registros.some((registro) => registro.tipo === "saida");
    const indisponivel = bloqueado || !estado.aluno || !estado.historicoCarregado;
    porId("btn-entrada").disabled = indisponivel || entrada;
    porId("btn-saida").disabled = indisponivel || !entrada || saida;
}

async function executar(idMensagem, acao) {
    if (estado.ocupado) return;
    estado.ocupado = true;
    atualizarBotoes();
    mensagem(idMensagem);
    try {
        await acao();
    } catch (erro) {
        const destino = {
            "tela-login": "mensagem-login",
            "tela-cadastro": "mensagem-cadastro",
            "tela-facial": "mensagem-facial",
            "tela-principal": "mensagem-principal",
        }[estado.tela] || idMensagem;
        mensagem(destino, erro.message || "Não foi possível concluir. Tente novamente.");
    } finally {
        estado.ocupado = false;
        atualizarBotoes();
    }
}

function limparSessao() {
    estado.aluno = null;
    estado.csrf = "";
    estado.sessaoConhecida = false;
    estado.historico = [];
    estado.hoje = null;
    estado.historicoCarregado = false;
    estado.acaoFacial = null;
    porId("login-senha").value = "";
    porId("cadastro-senha").value = "";
    mostrarTela("tela-login");
}

function dataBrasileira(data) {
    const partes = data.split("-");
    return partes.length === 3 ? partes.reverse().join("/") : data;
}

function horaCurta(hora) {
    const partes = String(hora).split(":");
    return partes.length >= 2 ? partes[0].padStart(2, "0") + ":" + partes[1] : String(hora);
}

function atualizarStatus() {
    porId("nome-aluno").textContent = estado.aluno ? estado.aluno.nome : "Aluno";
    const hoje = registrosHoje();
    for (const tipo of ["entrada", "saida"]) {
        const registro = hoje.find((item) => item.tipo === tipo);
        porId("status-" + tipo).textContent = !estado.historicoCarregado
            ? "Atualize os registros" : registro
                ? "Registrada às " + horaCurta(registro.horario) : "Ainda não registrada";
    }
    const lista = porId("lista-historico");
    lista.replaceChildren();
    const notificacoes = {
        pendente: "Aviso por e-mail na fila.",
        enviando: "Aviso por e-mail em processamento.",
        enviado: "Aviso aceito pelo servidor de e-mail.",
        falhou: "Não foi possível enviar o aviso por e-mail. Avise a equipe.",
    };
    if (!estado.historicoCarregado || !estado.historico.length) {
        const item = document.createElement("p");
        item.textContent = estado.historicoCarregado
            ? "Nenhum registro realizado." : "Não foi possível carregar os registros. Clique em Atualizar.";
        lista.appendChild(item);
    } else {
        estado.historico.forEach((registro) => {
            const item = document.createElement("p");
            item.className = "historico-item";
            const tipo = registro.tipo === "entrada" ? "Entrada" : "Saída";
            let texto = tipo + " registrada em " + dataBrasileira(registro.data)
                + " às " + horaCurta(registro.horario) + ".";
            if (registro.motivo_saida) texto += " Motivo: " + registro.motivo_saida + ".";
            if (notificacoes[registro.notificacao]) texto += " " + notificacoes[registro.notificacao];
            item.textContent = texto;
            lista.appendChild(item);
        });
    }
    atualizarBotoes();
}

async function carregarHistorico() {
    if (!estado.aluno) return;
    if (consultaHistorico) return consultaHistorico;
    const alunoId = estado.aluno.id;
    consultaHistorico = (async () => {
        try {
            const retorno = await api("/presencas");
            if (!Array.isArray(retorno.presencas) || typeof retorno.hoje !== "string") {
                throw new Error("O backend precisa retornar presencas e hoje na consulta do histórico.");
            }
            if (!estado.aluno || estado.aluno.id !== alunoId) return;
            estado.historico = retorno.presencas;
            estado.hoje = retorno.hoje;
            estado.historicoCarregado = true;
        } catch (erro) {
            if (estado.aluno && estado.aluno.id === alunoId) estado.historicoCarregado = false;
            throw erro;
        } finally {
            if (estado.aluno && estado.aluno.id === alunoId) atualizarStatus();
        }
    })();
    try {
        await consultaHistorico;
    } finally {
        consultaHistorico = null;
    }
}

async function irParaConta() {
    if (!estado.aluno.rosto_cadastrado) {
        await prepararFacial("cadastro");
        return;
    }
    mostrarTela("tela-principal");
    await carregarHistorico();
}

async function restaurarSessao() {
    const retorno = await api("/sessao");
    if (!estado.csrf || !Object.hasOwn(retorno, "aluno")) {
        throw new Error("O backend precisa retornar aluno e csrf_token na rota /sessao.");
    }
    estado.sessaoConhecida = true;
    estado.aluno = retorno.aluno;
    if (estado.aluno) await irParaConta();
    else mostrarTela("tela-login");
}

function mensagemCamera(erro) {
    if (erro.name === "NotAllowedError") return "Permita o acesso à câmera nas configurações do navegador.";
    if (erro.name === "NotFoundError") return "Nenhuma câmera foi encontrada neste aparelho.";
    if (erro.name === "NotReadableError") return "A câmera está ocupada. Feche outros aplicativos que a utilizam.";
    return "Não foi possível iniciar a câmera. Tente abrir novamente.";
}

async function abrirCamera() {
    pararCamera();
    const versao = estado.cameraVersao;
    mensagem("mensagem-facial", "Abrindo a câmera...", "info");
    atualizarBotoes();
    try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            throw new Error("Use HTTPS ou localhost para permitir o acesso à câmera.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
        });
        if (estado.tela !== "tela-facial" || versao !== estado.cameraVersao) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }
        estado.stream = stream;
        const camera = porId("camera");
        camera.srcObject = stream;
        await camera.play();
        // Aguarda dados reais do vídeo antes de habilitar captura.
        const iniciou = Date.now();
        while (camera.readyState < 2 || !camera.videoWidth || !camera.videoHeight) {
            if (versao !== estado.cameraVersao) return;
            if (Date.now() - iniciou > 10000) throw new Error("A câmera demorou para iniciar. Tente abrir novamente.");
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (versao !== estado.cameraVersao) return;
        estado.cameraPronta = true;
        mensagem("mensagem-facial", "Câmera pronta. Deixe somente seu rosto na imagem.", "sucesso");
    } catch (erro) {
        if (versao !== estado.cameraVersao) return;
        pararCamera();
        mensagem("mensagem-facial", erro.name === "Error" ? erro.message : mensagemCamera(erro));
    } finally {
        atualizarBotoes();
    }
}

async function prepararFacial(tipo, motivo = "") {
    estado.acaoFacial = { tipo, motivo };
    porId("titulo-facial").textContent = tipo === "cadastro" ? "Cadastro facial"
        : tipo === "entrada" ? "Confirmar entrada" : "Confirmar saída";
    porId("subtitulo-facial").textContent = tipo === "cadastro"
        ? "Cadastre seu rosto para verificar as próximas entradas e saídas."
        : "Uma nova foto será comparada com seu cadastro. Permita também o acesso à localização.";
    porId("btn-cadastrar-facial").textContent = tipo === "cadastro"
        ? "Cadastrar meu rosto" : tipo === "entrada" ? "Confirmar minha entrada" : "Confirmar minha saída";
    porId("btn-cancelar-facial").textContent = tipo === "cadastro" ? "Sair da conta" : "Cancelar";
    mostrarTela("tela-facial");
    // A permissão da câmera pode demorar: o usuário continua podendo cancelar.
    void abrirCamera();
}

function capturarFoto() {
    const camera = porId("camera");
    if (!estado.cameraPronta || !camera.srcObject || camera.readyState < 2) {
        throw new Error("Aguarde a câmera ficar pronta ou clique em Abrir câmera novamente.");
    }
    const escala = Math.min(1, 960 / Math.max(camera.videoWidth, camera.videoHeight));
    const canvas = porId("canvas-rosto");
    canvas.width = Math.round(camera.videoWidth * escala);
    canvas.height = Math.round(camera.videoHeight * escala);
    const contexto = canvas.getContext("2d");
    if (!contexto) throw new Error("Este navegador não conseguiu capturar a imagem.");
    contexto.drawImage(camera, 0, 0, canvas.width, canvas.height);
    const imagem = canvas.toDataURL("image/jpeg", 0.85);
    canvas.width = 0;
    canvas.height = 0;
    return imagem;
}

async function localizar() {
    if (!window.isSecureContext || !navigator.geolocation) {
        throw new Error("Use HTTPS ou localhost em um navegador com acesso à localização.");
    }
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
        (posicao) => resolve({
            latitude: posicao.coords.latitude,
            longitude: posicao.coords.longitude,
            precisao: posicao.coords.accuracy,
        }),
        (erro) => reject(new Error(erro.code === 1
            ? "Permita o acesso à localização nas configurações do navegador."
            : erro.code === 3 ? "A localização demorou. Ative o GPS e tente novamente."
                : "Não foi possível obter a localização. Ative o GPS e tente novamente.")),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    ));
}

async function sair() {
    // A câmera para imediatamente, mesmo se o servidor estiver indisponível.
    pararCamera();
    await api("/logout", {});
    const token = estado.csrf;
    limparSessao();
    estado.csrf = token;
    estado.sessaoConhecida = true;
    porId("login-ra").value = "";
    mensagem("mensagem-login", "Você saiu da conta.", "info");
}

for (const id of ["login-ra", "cadastro-ra"]) {
    porId(id).addEventListener("input", (evento) => {
        evento.target.value = normalizarRA(evento.target.value);
    });
}
porId("responsavel-telefone").addEventListener("input", (evento) => {
    const numero = evento.target.value.replace(/\D/g, "").slice(0, 11);
    const restante = numero.slice(2);
    evento.target.value = numero.length <= 2 ? numero
        : "(" + numero.slice(0, 2) + ") " + (restante.length > 4
            ? restante.slice(0, -4) + "-" + restante.slice(-4) : restante);
});

porId("btn-primeiro-acesso").addEventListener("click", () => {
    porId("cadastro-ra").value = normalizarRA(porId("login-ra").value);
    porId("cadastro-senha").value = "";
    mensagem("mensagem-cadastro");
    mostrarTela("tela-cadastro");
});
porId("btn-voltar-login").addEventListener("click", () => {
    porId("cadastro-senha").value = "";
    mostrarTela("tela-login");
});
porId("btn-atualizar-login").addEventListener("click", () => {
    void executar("mensagem-login", restaurarSessao);
});

porId("btn-login").addEventListener("click", () => {
    void executar("mensagem-login", async () => {
        const RA = validarRA(porId("login-ra").value);
        const senha = porId("login-senha").value;
        if (!senha) throw new Error("Preencha sua senha.");
        const retorno = await api("/login", { RA, senha });
        if (!retorno.aluno) throw new Error("O backend não retornou os dados do aluno.");
        estado.aluno = retorno.aluno;
        porId("login-senha").value = "";
        await irParaConta();
    });
});
porId("login-senha").addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" && !porId("btn-login").disabled) porId("btn-login").click();
});

porId("btn-cadastrar").addEventListener("click", () => {
    void executar("mensagem-cadastro", async () => {
        const dados = {
            nome: porId("cadastro-nome").value.trim(),
            email: porId("cadastro-email").value.trim(),
            RA: validarRA(porId("cadastro-ra").value),
            senha: porId("cadastro-senha").value,
            nome_responsavel: porId("responsavel-nome").value.trim(),
            telefone_responsavel: porId("responsavel-telefone").value.replace(/\D/g, ""),
            email_responsavel: porId("responsavel-email").value.trim(),
        };
        if (dados.nome.length < 3 || dados.nome_responsavel.length < 3) {
            throw new Error("Preencha o nome do aluno e do responsável.");
        }
        if (![dados.email, dados.email_responsavel].every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
            throw new Error("Confira o e-mail do aluno e do responsável.");
        }
        if (!/^\d{10,11}$/.test(dados.telefone_responsavel)) throw new Error("Informe o telefone com DDD.");
        if (dados.senha.trim().length < 8 || dados.senha.length > 128) {
            throw new Error("Crie uma senha com 8 a 128 caracteres.");
        }
        const retorno = await api("/alunos", dados);
        if (!retorno.aluno) throw new Error("O backend não retornou os dados do cadastro.");
        estado.aluno = retorno.aluno;
        porId("cadastro-senha").value = "";
        await irParaConta();
    });
});

porId("btn-entrada").addEventListener("click", () => {
    void executar("mensagem-principal", async () => {
        await carregarHistorico();
        if (registrosHoje().some((item) => item.tipo === "entrada")) {
            throw new Error("Sua entrada já foi registrada hoje.");
        }
        await prepararFacial(estado.aluno.rosto_cadastrado ? "entrada" : "cadastro");
    });
});
porId("btn-saida").addEventListener("click", () => {
    void executar("mensagem-principal", async () => {
        await carregarHistorico();
        const hoje = registrosHoje();
        if (!hoje.some((item) => item.tipo === "entrada")) throw new Error("Registre sua entrada primeiro.");
        if (hoje.some((item) => item.tipo === "saida")) throw new Error("Sua saída já foi registrada hoje.");
        porId("campo-motivo-saida").classList.remove("escondida");
        mensagem("mensagem-principal", "Informe o motivo se for uma saída antecipada e continue para a câmera.", "info");
        porId("motivo-saida").focus();
    });
});
porId("btn-confirmar-saida").addEventListener("click", () => {
    const motivo = porId("motivo-saida").value.trim();
    if (motivo.length > 500) {
        mensagem("mensagem-principal", "O motivo deve ter até 500 caracteres.");
        return;
    }
    void prepararFacial("saida", motivo);
});

porId("btn-cadastrar-facial").addEventListener("click", () => {
    void executar("mensagem-facial", async () => {
        const acao = estado.acaoFacial;
        if (!acao || !estado.aluno) throw new Error("Entre na conta para continuar.");
        if (acao.tipo === "cadastro") {
            const imagem = capturarFoto();
            mensagem("mensagem-facial", "Verificando o cadastro facial...", "info");
            await api("/rosto", { imagem });
            estado.aluno.rosto_cadastrado = true;
            mostrarTela("tela-principal");
            await carregarHistorico();
            mensagem("mensagem-principal", "Rosto cadastrado. Agora você pode registrar a entrada.", "sucesso");
            return;
        }
        mensagem("mensagem-facial", "Verificando a localização...", "info");
        const coordenadas = await localizar();
        // Captura após obter a localização: não reutiliza a imagem do cadastro.
        const imagem = capturarFoto();
        mensagem("mensagem-facial", "Conferindo o rosto e registrando...", "info");
        let retorno;
        try {
            retorno = await api("/presenca", {
                tipo: acao.tipo,
                ...coordenadas,
                imagem,
                motivo_saida: acao.tipo === "saida" ? acao.motivo : "",
            });
        } catch (erro) {
            if (estado.aluno) {
                mostrarTela("tela-principal");
                if (acao.tipo === "saida") porId("campo-motivo-saida").classList.remove("escondida");
                try { await carregarHistorico(); } catch { /* Mantém as ações bloqueadas se a consulta falhar. */ }
                mensagem("mensagem-principal", erro.message);
            }
            return;
        }
        mostrarTela("tela-principal");
        porId("campo-motivo-saida").classList.add("escondida");
        porId("motivo-saida").value = "";
        // Não anuncia envio: neste momento o e-mail pode estar apenas na fila.
        const aviso = retorno.notificacao === "pendente" ? " O aviso por e-mail está na fila." : "";
        try {
            await carregarHistorico();
            mensagem("mensagem-principal", retorno.mensagem + aviso, "sucesso");
        } catch (erro) {
            mensagem("mensagem-principal", retorno.mensagem + aviso + " " + erro.message);
        }
    });
});

porId("btn-reabrir-camera").addEventListener("click", () => { void abrirCamera(); });
porId("btn-cancelar-facial").addEventListener("click", () => {
    if (estado.acaoFacial?.tipo === "cadastro") {
        void executar("mensagem-facial", sair);
    } else {
        mostrarTela("tela-principal");
        estado.acaoFacial = null;
    }
});
porId("btn-sair").addEventListener("click", () => { void executar("mensagem-principal", sair); });
porId("btn-atualizar").addEventListener("click", () => {
    void executar("mensagem-principal", async () => {
        await carregarHistorico();
        mensagem("mensagem-principal", "Registros atualizados.", "sucesso");
    });
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        pararCamera();
        if (estado.tela === "tela-facial") {
            mensagem("mensagem-facial", "A câmera foi pausada. Clique em Abrir câmera novamente.", "info");
            atualizarBotoes();
        }
    } else if (estado.aluno && estado.tela === "tela-principal" && !estado.ocupado) {
        void executar("mensagem-principal", carregarHistorico);
    }
});
window.addEventListener("pagehide", pararCamera);
// Reconsulta datas e situação do e-mail; a data de hoje sempre vem do servidor.
setInterval(() => {
    if (!document.hidden && estado.aluno && estado.tela === "tela-principal" && !estado.ocupado) {
        void executar("mensagem-principal", carregarHistorico);
    }
}, 60000);

void executar("mensagem-login", async () => {
    if (window.location.protocol === "file:") {
        throw new Error("Não abra o HTML direto. Ligue o backend e abra http://127.0.0.1:5000.");
    }
    await restaurarSessao();
});
