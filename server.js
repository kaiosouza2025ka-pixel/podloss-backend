const express = require("express");
const cors = require("cors");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Garantir diretório de screenshots
if (!fs.existsSync("screenshots")) {
  fs.mkdirSync("screenshots", { recursive: true });
}
app.use('/screenshots', express.static('screenshots'));

// Estado global
const state = {
  browser: null,
  context: null,
  page: null,
  isLogged: false,
  processing: false
};

// Configurações
const CONFIG = {
  BASE_URL: 'https://y1c7m5s.com',
  LOGIN_URL: 'https://y1c7m5s.com/main/entrar',
  HOME_URL: 'https://y1c7m5s.com/main/inicio',
  DEPOSIT_URL: 'https://y1c7m5s.com/main/deposito',
  HEADLESS: true,
  TIMEOUT: 60000,
  PLATFORM_EMAIL: process.env.PLATFORM_EMAIL || "",
  PLATFORM_PASSWORD: process.env.PLATFORM_PASSWORD || "",
  PROXY_SERVER: process.env.PROXY_SERVER || ""
};

// Função para salvar screenshot
async function saveScreenshot(page, name) {
  try {
    const timestamp = Date.now();
    const filename = `${name}_${timestamp}.png`;
    const filepath = path.join('screenshots', filename);
    await page.screenshot({ path: filepath, fullPage: true });
    return `/screenshots/${filename}`;
  } catch (error) {
    console.error(`Erro ao salvar screenshot ${name}:`, error);
    return null;
  }
}

// Função para inicializar browser
async function initBrowser() {
  if (state.browser) {
    await state.browser.close().catch(() => {});
    state.browser = null;
  }
  
  const launchOptions = {
    headless: CONFIG.HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  };
  
  if (CONFIG.PROXY_SERVER) {
    launchOptions.proxy = {
      server: `http://${CONFIG.PROXY_SERVER}`
    };
    console.log('🔄 Usando proxy:', CONFIG.PROXY_SERVER);
  } else {
    console.log('⚠️ Nenhum proxy configurado - usando IP local');
  }
  
  state.browser = await chromium.launch(launchOptions);
  
  state.context = await state.browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true
  });
  
  state.page = await state.context.newPage();
  return state.page;
}

// Função para fazer login
async function fazerLogin(email, senha) {
  console.log('🔐 Fazendo login na plataforma...');
  
  try {
    const page = state.page;
    
    await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
    await page.waitForTimeout(3000);
    await saveScreenshot(page, '1_login_page');
    
    console.log('📧 Preenchendo email...');
    
    const emailPreenchido = await page.evaluate((email) => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        if (input.type === 'email' || 
            input.name.toLowerCase().includes('email') || 
            input.placeholder.toLowerCase().includes('email') || 
            input.placeholder.toLowerCase().includes('usuário') ||
            input.placeholder.toLowerCase().includes('usuario')) {
          input.value = email;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      for (const input of inputs) {
        if (input.offsetParent !== null) {
          input.value = email;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, email);
    
    if (!emailPreenchido) {
      console.error('❌ Campo de email não encontrado');
      await saveScreenshot(page, 'erro_campo_email');
      return { success: false, error: 'Campo de email não encontrado' };
    }
    
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '2_email_preenchido');
    
    console.log('🔘 Clicando em continuar...');
    const continuarClicado = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a, input[type="submit"], ion-button');
      for (const btn of buttons) {
        const text = btn.innerText || btn.value || '';
        if (text.includes('Continuar') || text.includes('Avançar') || 
            text.includes('Próximo') || text.includes('Proximo') || 
            text.includes('OK') || text.includes('Ok') || 
            text.includes('Enviar')) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    
    if (!continuarClicado) {
      console.log('⚠️ Botão continuar não encontrado, tentando Enter...');
      await page.keyboard.press('Enter');
    }
    
    await page.waitForTimeout(3000);
    await saveScreenshot(page, '3_apos_continuar');
    
    console.log('🔑 Preenchendo senha...');
    
    const senhaPreenchida = await page.evaluate((senha) => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        if (input.type === 'password') {
          input.value = senha;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, senha);
    
    if (!senhaPreenchida) {
      console.error('❌ Campo de senha não encontrado');
      await saveScreenshot(page, 'erro_campo_senha');
      return { success: false, error: 'Campo de senha não encontrado' };
    }
    
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '4_senha_preenchida');
    
    console.log('🔘 Clicando em entrar...');
    const entrarClicado = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a, input[type="submit"], ion-button');
      for (const btn of buttons) {
        const text = btn.innerText || btn.value || '';
        if (text.includes('Entrar') || text.includes('Login') || 
            text.includes('Acessar') || text.includes('Continuar')) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    
    if (!entrarClicado) {
      console.log('⚠️ Botão entrar não encontrado, tentando Enter...');
      await page.keyboard.press('Enter');
    }
    
    await page.waitForTimeout(8000);
    await saveScreenshot(page, '5_apos_login');
    
    const currentUrl = page.url();
    console.log('📍 URL após login:', currentUrl);
    
    state.isLogged = true;
    console.log('✅ Login realizado com sucesso!');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erro no login:', error.message);
    await saveScreenshot(state.page, 'erro_login');
    return { success: false, error: error.message };
  }
}

// Função para navegar até depósito
async function navegarParaDeposito() {
  console.log('💰 Navegando para página de depósito...');
  
  try {
    const page = state.page;
    
    await page.goto(CONFIG.DEPOSIT_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
    await page.waitForTimeout(5000);
    await saveScreenshot(page, '4_pagina_deposito');
    
    const currentUrl = page.url();
    if (currentUrl.includes('entrar') || currentUrl.includes('login')) {
      console.log('⚠️ Precisando navegar manualmente para depósito');
      
      await page.goto(CONFIG.HOME_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
      await page.waitForTimeout(3000);
      
      const depositLinks = await page.$$('a:has-text("Depósito"), a:has-text("Deposito"), a:has-text("deposito"), a:has-text("depósito"), button:has-text("Depósito"), ion-button:has-text("Depósito")');
      
      for (const link of depositLinks) {
        const href = await link.getAttribute('href');
        if (href && href.includes('deposit')) {
          await link.click();
          await page.waitForTimeout(5000);
          break;
        }
      }
    }
    
    await saveScreenshot(page, '5_deposito_final');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erro ao navegar para depósito:', error.message);
    return { success: false, error: error.message };
  }
}

// Função para selecionar PIX
async function selecionarPIX() {
  console.log('💳 Selecionando método PIX...');
  
  try {
    const page = state.page;
    
    const pixSelecionado = await page.evaluate(() => {
      const elements = document.querySelectorAll('button, div, span, ion-button, ion-segment-button, a');
      for (const el of elements) {
        const text = el.innerText || el.textContent || '';
        if (text.trim() === 'PIX' || text.trim() === 'Pix') {
          el.click();
          return true;
        }
      }
      return false;
    });
    
    if (pixSelecionado) {
      await page.waitForTimeout(3000);
      await saveScreenshot(page, '6_pix_selecionado');
      console.log('✅ PIX selecionado');
    } else {
      console.log('⚠️ Botão PIX não encontrado, verificando se já está selecionado');
      await saveScreenshot(page, '6_sem_botao_pix');
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erro ao selecionar PIX:', error.message);
    return { success: false, error: error.message };
  }
}

// Função para preencher valor - ATUALIZADA
async function preencherValor(valor) {
  console.log(`💵 Preenchendo valor: R$ ${valor}`);
  
  try {
    const page = state.page;
    
    const valorPreenchido = await page.evaluate((valor) => {
      const inputs = document.querySelectorAll('input');
      
      // Primeiro, procurar input numérico visível
      for (const input of inputs) {
        if (input.offsetParent !== null && input.type !== 'hidden') {
          const placeholder = input.placeholder || '';
          const name = input.name || '';
          const type = input.type || '';
          const id = input.id || '';
          
          if (
            type === 'number' || 
            type === 'text' || 
            type === 'tel' ||
            placeholder.toLowerCase().includes('valor') || 
            placeholder.toLowerCase().includes('value') || 
            placeholder.toLowerCase().includes('depósito') ||
            placeholder.toLowerCase().includes('deposito') ||
            placeholder.toLowerCase().includes('r$') ||
            placeholder.includes('$') ||
            name.toLowerCase().includes('valor') || 
            name.toLowerCase().includes('value') || 
            name.toLowerCase().includes('amount') ||
            name.toLowerCase().includes('deposit') ||
            id.toLowerCase().includes('valor') || 
            id.toLowerCase().includes('value') || 
            id.toLowerCase().includes('amount')
          ) {
            input.value = valor;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
      }
      
      // Se não achou, pegar primeiro input visível
      for (const input of inputs) {
        if (input.offsetParent !== null && input.type !== 'hidden') {
          input.value = valor;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      
      return false;
    }, valor.toString());
    
    if (!valorPreenchido) {
      console.error('❌ Campo de valor não encontrado');
      await saveScreenshot(page, 'erro_campo_valor');
      return { success: false, error: 'Campo de valor não encontrado' };
    }
    
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '7_valor_preenchido');
    console.log('✅ Valor preenchido');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erro ao preencher valor:', error.message);
    return { success: false, error: error.message };
  }
}

// Função para gerar PIX - ATUALIZADA
async function gerarPIX() {
  console.log('🎯 Gerando PIX...');
  
  try {
    const page = state.page;
    
    const gerado = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a, input[type="submit"], ion-button, div[role="button"]');
      for (const btn of buttons) {
        const text = btn.innerText || btn.value || btn.textContent || '';
        if (text.includes('Depositar') || text.includes('Deposito') || 
            text.includes('Gerar') || text.includes('Continuar') || 
            text.includes('Confirmar')) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    
    if (gerado) {
      await page.waitForTimeout(8000);
      await saveScreenshot(page, '8_pix_gerado');
      console.log('✅ Botão de depositar clicado');
    } else {
      console.error('❌ Botão de depositar não encontrado');
      await saveScreenshot(page, 'erro_botao_gerar');
      return { success: false, error: 'Botão de depositar não encontrado' };
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erro ao gerar PIX:', error.message);
    return { success: false, error: error.message };
  }
}

// Função para extrair código PIX
async function extrairCodigoPIX() {
  console.log('🔍 Extraindo código PIX...');
  
  try {
    const page = state.page;
    
    await page.waitForTimeout(5000);
    await saveScreenshot(page, '9_extraindo_pix');
    
    const pixCode = await page.evaluate(() => {
      const patterns = [
        /00020126\d{20,}/,
        /000201[0-9]{20,}/,
        /[0-9]{32,}/,
        /[A-Z0-9]{32,}/
      ];
      
      const allText = document.body.innerText;
      
      for (const pattern of patterns) {
        const matches = allText.match(pattern);
        if (matches && matches[0]) {
          return matches[0];
        }
      }
      
      const inputs = document.querySelectorAll('input, textarea');
      for (const input of inputs) {
        const value = input.value || '';
        if (value.length > 30) {
          return value;
        }
      }
      
      const codeElements = document.querySelectorAll('[class*="pix"], [class*="qr"], [class*="code"], [id*="pix"], [id*="qr"], [id*="code"]');
      for (const el of codeElements) {
        const text = el.textContent || el.value || '';
        if (text.length > 30) {
          return text;
        }
      }
      
      const qrImages = document.querySelectorAll('img[src*="qr"], canvas, img[alt*="qr" i], img[alt*="pix" i]');
      if (qrImages.length > 0) {
        const qrSrc = qrImages[0].src || '';
        if (qrSrc.length > 0) {
          return qrSrc;
        }
      }
      
      return null;
    });
    
    if (!pixCode) {
      const shadowPix = await page.evaluate(() => {
        const elements = document.querySelectorAll('*');
        for (let el of elements) {
          if (el.shadowRoot) {
            const text = el.shadowRoot.textContent;
            const matches = text.match(/(?:00020126\d{20,}|000201[0-9]{20,}|[0-9]{32,}|[A-Z0-9]{32,})/g);
            if (matches && matches[0]) {
              return matches[0];
            }
          }
        }
        return null;
      });
      
      if (shadowPix) {
        console.log('✅ Código PIX encontrado no shadow DOM');
        return { success: true, pixCode: shadowPix };
      }
    }
    
    if (pixCode) {
      console.log('✅ Código PIX encontrado!');
      console.log('📋 Código:', pixCode.substring(0, 50) + '...');
      return { success: true, pixCode };
    }
    
    console.error('❌ Código PIX não encontrado');
    await saveScreenshot(page, '10_pix_nao_encontrado');
    return { success: false, error: 'Código PIX não encontrado' };
    
  } catch (error) {
    console.error('❌ Erro ao extrair código PIX:', error.message);
    return { success: false, error: error.message };
  }
}

// Função principal para gerar depósito PIX
async function gerarDepositoPIX(valor) {
  console.log(`\n🚀 INICIANDO GERAÇÃO DE PIX - Valor: R$ ${valor}\n`);
  
  try {
    await initBrowser();
    
    const loginResult = await fazerLogin(CONFIG.PLATFORM_EMAIL, CONFIG.PLATFORM_PASSWORD);
    if (!loginResult.success) {
      return loginResult;
    }
    
    const navResult = await navegarParaDeposito();
    if (!navResult.success) {
      return navResult;
    }
    
    const pixResult = await selecionarPIX();
    if (!pixResult.success) {
      return pixResult;
    }
    
    const valorResult = await preencherValor(valor);
    if (!valorResult.success) {
      return valorResult;
    }
    
    const gerarResult = await gerarPIX();
    if (!gerarResult.success) {
      return gerarResult;
    }
    
    const codigoResult = await extrairCodigoPIX();
    if (codigoResult.success) {
      return {
        success: true,
        pixCode: codigoResult.pixCode,
        valor: valor,
        message: 'PIX gerado com sucesso!'
      };
    }
    
    return codigoResult;
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
    return { success: false, error: error.message };
  }
}

// ==========================================
// ROTAS
// ==========================================

// Rota principal
app.get("/", (req, res) => {
  res.send("Backend online! Sistema de PIX funcionando. Acesse /teste para testar.");
});

// Rota GET para página de teste
app.get("/teste", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Teste PIX</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 400px;
          margin: 50px auto;
          padding: 20px;
          background: #f0f0f0;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h2 {
          text-align: center;
          color: #333;
        }
        input {
          width: 100%;
          padding: 10px;
          margin: 10px 0;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 16px;
          box-sizing: border-box;
        }
        button {
          width: 100%;
          padding: 12px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 5px;
          font-size: 16px;
          cursor: pointer;
          font-weight: bold;
        }
        button:hover {
          background: #45a049;
        }
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        #resultado {
          margin-top: 20px;
          padding: 15px;
          border-radius: 5px;
          display: none;
          word-break: break-all;
        }
        .sucesso {
          background: #d4edda;
          border: 1px solid #c3e6cb;
          color: #155724;
        }
        .erro {
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          color: #721c24;
        }
        #loading {
          display: none;
          text-align: center;
          margin: 20px 0;
          color: #666;
        }
        textarea {
          width: 100%;
          height: 100px;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 12px;
          box-sizing: border-box;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>💰 Gerar PIX</h2>
        
        <label>Valor (R$):</label>
        <input type="number" id="valor" placeholder="100" min="20" value="100">
        
        <label>Produto:</label>
        <input type="text" id="produto" placeholder="Nome do produto" value="Produto Teste">
        
        <label>Cliente:</label>
        <input type="text" id="cliente" placeholder="Nome do cliente" value="Cliente Teste">
        
        <button id="btnGerar" onclick="gerarPix()">Gerar PIX</button>
        
        <div id="loading">
          <p>⏳ Gerando PIX...</p>
          <p><small>Isso pode levar 30-60 segundos</small></p>
        </div>
        
        <div id="resultado"></div>
      </div>
      
      <script>
        async function gerarPix() {
          const valor = document.getElementById('valor').value;
          const produto = document.getElementById('produto').value;
          const cliente = document.getElementById('cliente').value;
          
          if (!valor || valor < 20) {
            alert('Valor mínimo é R$ 20');
            return;
          }
          
          const btn = document.getElementById('btnGerar');
          const loading = document.getElementById('loading');
          const resultado = document.getElementById('resultado');
          
          btn.disabled = true;
          loading.style.display = 'block';
          resultado.style.display = 'none';
          
          try {
            const response = await fetch('/deposito', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                valor: parseFloat(valor),
                produto: produto,
                cliente: cliente
              })
            });
            
            const data = await response.json();
            
            loading.style.display = 'none';
            resultado.style.display = 'block';
            
            if (data.status === 'ok') {
              resultado.className = 'sucesso';
              resultado.innerHTML = \`
                <h3>✅ PIX Gerado!</h3>
                <p><strong>Valor:</strong> R$ \${valor}</p>
                <p><strong>Código PIX:</strong></p>
                <textarea readonly>\${data.pix_code}</textarea>
                <button onclick="copiarPix()" style="margin-top:10px;">📋 Copiar Código</button>
              \`;
            } else {
              resultado.className = 'erro';
              resultado.innerHTML = \`
                <h3>❌ Erro</h3>
                <p>\${data.message || 'Erro desconhecido'}</p>
              \`;
            }
          } catch (error) {
            loading.style.display = 'none';
            resultado.style.display = 'block';
            resultado.className = 'erro';
            resultado.innerHTML = \`
              <h3>❌ Erro de Conexão</h3>
              <p>\${error.message}</p>
            \`;
          } finally {
            btn.disabled = false;
          }
        }
        
        function copiarPix() {
          const textarea = document.querySelector('textarea');
          textarea.select();
          document.execCommand('copy');
          alert('Código copiado!');
        }
      </script>
    </body>
    </html>
  `);
});

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Servidor funcionando!",
    timestamp: new Date().toISOString()
  });
});

// Rota para screenshots de debug
app.get("/debug-screenshots", (req, res) => {
  try {
    const files = fs.readdirSync("screenshots");
    const screenshots = files.map(file => ({
      filename: file,
      url: `/screenshots/${file}`
    }));
    res.json({ 
      status: "ok", 
      screenshots 
    });
  } catch (error) {
    res.json({ 
      status: "erro", 
      screenshots: [], 
      error: error.message 
    });
  }
});

// Rota para gerar PIX
app.post("/deposito", async (req, res) => {
  try {
    const {
      valor,
      produto,
      sabor,
      quantidade,
      identificador,
      cliente,
      telefone
    } = req.body;

    console.log("💰 Nova solicitação de PIX:");
    console.log({
      valor,
      produto,
      sabor,
      quantidade,
      identificador,
      cliente,
      telefone
    });

    if (!valor) {
      return res.status(400).json({
        status: "erro",
        message: "Valor é obrigatório"
      });
    }

    if (state.processing) {
      return res.status(429).json({
        status: "erro",
        message: "Sistema ocupado. Aguarde alguns segundos."
      });
    }

    state.processing = true;

    const resultado = await gerarDepositoPIX(valor);
    
    state.processing = false;

    if (resultado.success) {
      return res.status(200).json({
        status: "ok",
        pix_code: resultado.pixCode,
        valor: valor,
        message: "PIX gerado com sucesso!"
      });
    } else {
      return res.status(500).json({
        status: "erro",
        message: resultado.error || "Não foi possível gerar o PIX"
      });
    }

  } catch (error) {
    state.processing = false;
    console.error(error);
    return res.status(500).json({
      status: "erro",
      message: "Erro interno do servidor."
    });
  }
});

// Inicialização
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`💰 Página de teste: http://localhost:${PORT}/teste`);
  console.log(`🔍 Debug screenshots: http://localhost:${PORT}/debug-screenshots`);
  console.log(`\n⚠️  Configurações:`);
  console.log(`    PLATFORM_EMAIL: ${CONFIG.PLATFORM_EMAIL ? '✅ Configurado' : '❌ Não configurado'}`);
  console.log(`    PLATFORM_PASSWORD: ${CONFIG.PLATFORM_PASSWORD ? '✅ Configurado' : '❌ Não configurado'}`);
  console.log(`    PROXY_SERVER: ${CONFIG.PROXY_SERVER ? '✅ Configurado' : '❌ Não configurado'}`);
});
