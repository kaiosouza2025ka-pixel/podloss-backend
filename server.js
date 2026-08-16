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
  // Credenciais da plataforma (configure aqui)
  PLATFORM_EMAIL: process.env.PLATFORM_EMAIL || "seu_email_aqui",
  PLATFORM_PASSWORD: process.env.PLATFORM_PASSWORD || "sua_senha_aqui"
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
  
  state.browser = await chromium.launch({
    headless: CONFIG.HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });
  
  state.context = await state.browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true
  });
  
  state.page = await state.context.newPage();
  return state.page;
}

// Função para fazer login manual
async function fazerLogin(email, senha) {
  console.log('🔐 Fazendo login na plataforma...');
  
  try {
    const page = state.page;
    
    // Navegar para página de login
    await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
    await page.waitForTimeout(3000);
    await saveScreenshot(page, '1_login_page');
    
    // Procurar campos de email
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="e-mail" i]',
      'input[placeholder*="usuário" i]',
      'input[placeholder*="usuario" i]',
      'input[formcontrolname="email"]',
      'ion-input input',
      'input'
    ];
    
    let emailInput = null;
    for (const selector of emailSelectors) {
      const inputs = await page.$$(selector);
      for (const input of inputs) {
        const type = await input.getAttribute('type');
        const placeholder = await input.getAttribute('placeholder');
        const name = await input.getAttribute('name');
        
        if (type === 'email' || 
            (placeholder && (placeholder.toLowerCase().includes('email') || 
                             placeholder.toLowerCase().includes('e-mail') || 
                             placeholder.toLowerCase().includes('usuário') || 
                             placeholder.toLowerCase().includes('usuario'))) ||
            (name && name.toLowerCase().includes('email'))) {
          emailInput = input;
          break;
        }
      }
      if (emailInput) break;
    }
    
    // Se não achou por atributos, pegar primeiro input visível
    if (!emailInput) {
      const visibleInputs = await page.$$('input:visible');
      if (visibleInputs.length > 0) {
        emailInput = visibleInputs[0];
      }
    }
    
    // Procurar campo de senha
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="senha" i]',
      'input[formcontrolname="password"]'
    ];
    
    let passwordInput = null;
    for (const selector of passwordSelectors) {
      passwordInput = await page.$(selector);
      if (passwordInput) break;
    }
    
    // Se não achou, pegar segundo input visível
    if (!passwordInput) {
      const visibleInputs = await page.$$('input:visible');
      if (visibleInputs.length > 1) {
        passwordInput = visibleInputs[1];
      }
    }
    
    if (!emailInput || !passwordInput) {
      console.error('❌ Campos de login não encontrados');
      await saveScreenshot(page, 'erro_campos_login');
      return { success: false, error: 'Campos de login não encontrados' };
    }
    
    // Preencher credenciais
    await emailInput.click();
    await page.waitForTimeout(500);
    await emailInput.fill(email);
    await page.waitForTimeout(500);
    
    await passwordInput.click();
    await page.waitForTimeout(500);
    await passwordInput.fill(senha);
    await page.waitForTimeout(1000);
    
    await saveScreenshot(page, '2_credenciais_preenchidas');
    
    // Procurar botão de login
    const buttonSelectors = [
      'button[type="submit"]',
      'button:has-text("Entrar")',
      'button:has-text("Login")',
      'button:has-text("Acessar")',
      'button:has-text("Continuar")',
      'ion-button:has-text("Entrar")',
      'ion-button:has-text("Login")',
      'button'
    ];
    
    let loginButton = null;
    for (const selector of buttonSelectors) {
      const buttons = await page.$$(selector);
      for (const button of buttons) {
        const text = await button.innerText().catch(() => '');
        if (text && (text.includes('Entrar') || text.includes('Login') || 
                     text.includes('Acessar') || text.includes('Continuar'))) {
          loginButton = button;
          break;
        }
      }
      if (loginButton) break;
    }
    
    if (!loginButton) {
      console.error('❌ Botão de login não encontrado');
      await saveScreenshot(page, 'erro_botao_login');
      
      // Tentar pressionar Enter
      await passwordInput.press('Enter');
      await page.waitForTimeout(5000);
    } else {
      await loginButton.click();
      await page.waitForTimeout(8000);
    }
    
    await saveScreenshot(page, '3_apos_login');
    
    // Verificar se login foi bem sucedido
    const currentUrl = page.url();
    console.log('📍 URL após login:', currentUrl);
    
    if (currentUrl.includes('entrar') || currentUrl.includes('login')) {
      // Pode ter falhado ou estar carregando
      await page.waitForTimeout(5000);
      const newUrl = page.url();
      
      if (newUrl.includes('entrar') || newUrl.includes('login')) {
        console.error('❌ Login falhou - continua na página de login');
        return { success: false, error: 'Login falhou' };
      }
    }
    
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
    
    // Tentar URL direta
    await page.goto(CONFIG.DEPOSIT_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
    await page.waitForTimeout(5000);
    await saveScreenshot(page, '4_pagina_deposito');
    
    // Se a URL direta não funcionou, procurar link de depósito
    const currentUrl = page.url();
    if (currentUrl.includes('entrar') || currentUrl.includes('login')) {
      console.log('⚠️ Precisando navegar manualmente para depósito');
      
      // Voltar para home
      await page.goto(CONFIG.HOME_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
      await page.waitForTimeout(3000);
      
      // Procurar link de depósito
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
    
    // Procurar botão PIX
    const pixSelectors = [
      'button:has-text("PIX")',
      'button:has-text("Pix")',
      'div:has-text("PIX")',
      'span:has-text("PIX")',
      'ion-button:has-text("PIX")',
      'ion-segment-button:has-text("PIX")',
      '[value="pix"]',
      'img[alt*="PIX" i]',
      'img[src*="pix" i]'
    ];
    
    let pixButton = null;
    for (const selector of pixSelectors) {
      pixButton = await page.$(selector);
      if (pixButton) {
        await pixButton.click();
        await page.waitForTimeout(3000);
        await saveScreenshot(page, '6_pix_selecionado');
        console.log('✅ PIX selecionado');
        return { success: true };
      }
    }
    
    // Se não achou botão específico, verificar se PIX já está selecionado
    console.log('⚠️ Botão PIX não encontrado, verificando se já está selecionado');
    await saveScreenshot(page, '6_sem_botao_pix');
    return { success: true }; // Continuar mesmo sem clicar
    
  } catch (error) {
    console.error('❌ Erro ao selecionar PIX:', error.message);
    return { success: false, error: error.message };
  }
}

// Função para preencher valor
async function preencherValor(valor) {
  console.log(`💵 Preenchendo valor: R$ ${valor}`);
  
  try {
    const page = state.page;
    
    // Procurar campo de valor
    const amountSelectors = [
      'input[type="number"]',
      'input[name="amount"]',
      'input[name="valor"]',
      'input[name="value"]',
      'input[placeholder*="valor" i]',
      'input[placeholder*="value" i]',
      'input[placeholder*="amount" i]',
      'input[placeholder*="R$" i]',
      'input[inputmode="numeric"]',
      'ion-input input'
    ];
    
    let amountInput = null;
    for (const selector of amountSelectors) {
      const inputs = await page.$$(selector);
      for (const input of inputs) {
        const placeholder = await input.getAttribute('placeholder');
        const name = await input.getAttribute('name');
        const type = await input.getAttribute('type');
        
        if (type === 'number' || 
            (placeholder && (placeholder.toLowerCase().includes('valor') || 
                             placeholder.toLowerCase().includes('value') || 
                             placeholder.toLowerCase().includes('amount') || 
                             placeholder.includes('R$'))) ||
            (name && (name.toLowerCase().includes('valor') || 
                      name.toLowerCase().includes('value') || 
                      name.toLowerCase().includes('amount')))) {
          amountInput = input;
          break;
        }
      }
      if (amountInput) break;
    }
    
    if (!amountInput) {
      console.error('❌ Campo de valor não encontrado');
      await saveScreenshot(page, 'erro_campo_valor');
      return { success: false, error: 'Campo de valor não encontrado' };
    }
    
    // Limpar campo e preencher
    await amountInput.click();
    await page.waitForTimeout(500);
    await amountInput.fill('');
    await page.waitForTimeout(500);
    await amountInput.type(valor.toString());
    await page.waitForTimeout(2000);
    
    await saveScreenshot(page, '7_valor_preenchido');
    console.log('✅ Valor preenchido');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erro ao preencher valor:', error.message);
    return { success: false, error: error.message };
  }
}

// Função para gerar PIX
async function gerarPIX() {
  console.log('🎯 Gerando PIX...');
  
  try {
    const page = state.page;
    
    // Procurar botão de gerar
    const generateSelectors = [
      'button:has-text("Gerar")',
      'button:has-text("Gerar PIX")',
      'button:has-text("Continuar")',
      'button:has-text("Confirmar")',
      'button:has-text("Depositar")',
      'button[type="submit"]',
      'ion-button:has-text("Gerar")',
      'ion-button:has-text("Continuar")',
      'ion-button:has-text("Confirmar")'
    ];
    
    let generateButton = null;
    for (const selector of generateSelectors) {
      generateButton = await page.$(selector);
      if (generateButton) {
        await generateButton.click();
        await page.waitForTimeout(8000);
        await saveScreenshot(page, '8_pix_gerado');
        console.log('✅ Botão de gerar clicado');
        return { success: true };
      }
    }
    
    console.error('❌ Botão de gerar não encontrado');
    await saveScreenshot(page, 'erro_botao_gerar');
    return { success: false, error: 'Botão de gerar não encontrado' };
    
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
    
    // Esperar mais um pouco para o PIX carregar
    await page.waitForTimeout(5000);
    await saveScreenshot(page, '9_extraindo_pix');
    
    // Buscar código PIX em todo o DOM
    const pixCode = await page.evaluate(() => {
      // Padrões comuns de código PIX
      const patterns = [
        /00020126\d{20,}/,           // Padrão EMV completo
        /000201[0-9]{20,}/,          // Padrão EMV
        /[0-9]{32,}/,                // Números longos
        /[A-Z0-9]{32,}/              // Alphanuméricos longos
      ];
      
      // Buscar em todo o texto da página
      const allText = document.body.innerText;
      
      for (const pattern of patterns) {
        const matches = allText.match(pattern);
        if (matches && matches[0]) {
          return matches[0];
        }
      }
      
      // Buscar em inputs e textareas
      const inputs = document.querySelectorAll('input, textarea');
      for (const input of inputs) {
        const value = input.value || '';
        if (value.length > 30) {
          return value;
        }
      }
      
      // Buscar em elementos com classes específicas
      const codeElements = document.querySelectorAll('[class*="pix"], [class*="qr"], [class*="code"], [id*="pix"], [id*="qr"], [id*="code"]');
      for (const el of codeElements) {
        const text = el.textContent || el.value || '';
        if (text.length > 30) {
          return text;
        }
      }
      
      // Buscar QR Code (canvas ou img)
      const qrImages = document.querySelectorAll('img[src*="qr"], canvas, img[alt*="qr" i], img[alt*="pix" i]');
      if (qrImages.length > 0) {
        // Se tem QR code, pegar o src
        const qrSrc = qrImages[0].src || '';
        if (qrSrc.length > 0) {
          return qrSrc;
        }
      }
      
      return null;
    });
    
    // Buscar em shadow DOM
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
    // 1. Inicializar browser
    await initBrowser();
    
    // 2. Fazer login
    const loginResult = await fazerLogin(CONFIG.PLATFORM_EMAIL, CONFIG.PLATFORM_PASSWORD);
    if (!loginResult.success) {
      return loginResult;
    }
    
    // 3. Navegar para depósito
    const navResult = await navegarParaDeposito();
    if (!navResult.success) {
      return navResult;
    }
    
    // 4. Selecionar PIX
    const pixResult = await selecionarPIX();
    if (!pixResult.success) {
      return pixResult;
    }
    
    // 5. Preencher valor
    const valorResult = await preencherValor(valor);
    if (!valorResult.success) {
      return valorResult;
    }
    
    // 6. Gerar PIX
    const gerarResult = await gerarPIX();
    if (!gerarResult.success) {
      return gerarResult;
    }
    
    // 7. Extrair código PIX
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

// Rota principal
app.get("/", (req, res) => {
  res.send("Backend online! Sistema de PIX funcionando.");
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
  console.log(`🔍 Debug screenshots: http://localhost:${PORT}/debug-screenshots`);
  console.log(`\n⚠️  IMPORTANTE: Configure as credenciais da plataforma no Railway:`);
  console.log(`    PLATFORM_EMAIL = seu_email_da_plataforma`);
  console.log(`    PLATFORM_PASSWORD = sua_senha_da_plataforma`);
});