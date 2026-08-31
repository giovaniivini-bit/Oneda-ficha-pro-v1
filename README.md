# ONEDA FICHA PRO v1 🚀

Aplicativo moderno e de alta performance para apresentação comercial de produtos, fichas técnicas, custos, markups e variações em tempo real, integrado diretamente com o **Google Sheets** e **Google Drive**.

---

## ✨ Principais Funcionalidades

- **Arquitetura em 2 Telas Fluidas**:
  - **Tela 1 (Configuração & Filtros)**: Seleção interativa por Salas (multi-seleção), escolha do formato de apresentação (Lista com rolagem livre vs 1 por Folha / Showcase fixo 100%).
  - **Tela 2 (Apresentação Comercial & Vitrine)**:
    - Imagem do produto em destaque máximo com suporte a ampliação/zoom.
    - Menu lateral extenso com **Custo Principal**, **PDV Sugerido** (com markup informativo) e **Opções / Variações** (Variação 1, 2, 3 e preços).
    - Faixa inferior de **Observações Técnicas** em largura total.
    - Navegação rápida por setas do teclado (`↑` Cima / `↓` Baixo) ou pelo catálogo rápido.
- **Sincronização em Tempo Real com Google Sheets**:
  - Leitura direta via endpoint de proxy `/api/sheet-data`.
  - Botão de **Sincronização Forçada** (`🔄 Sincronizar`) e polling inteligente automático.
- **Edição Rápida de Ficha (`✏️ Editar`)**:
  - Formulário integrado para ajuste de custos, markup, observações e variações com persistência e script Google Apps Script pronto para webhook.
- **Integração com Fotos do Google Drive**:
  - Scripts automatizados para sincronização local e via VPS (`sync_drive.py` e `.bat`).

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: HTML5 Semântico, CSS3 Moderno (Glassmorphism, Neon Glows, Ambient Gradients), JavaScript ES6+ Puro (Zero frameworks, carregamento instantâneo).
- **Backend / Servidor**: Node.js HTTP Server nativo (Sem dependências externas).
- **Ícones e Tipografia**: FontAwesome 6.5, Google Fonts (Outfit, Inter).

---

## 🚀 Como Executar Localmente

1. Certifique-se de ter o [Node.js](https://nodejs.org/) instalado.
2. Inicie o servidor:
   ```bash
   node server.js
   ```
3. Abra no navegador:
   ```
   http://localhost:3040
   ```

---

## 📁 Estrutura de Arquivos

```
├── index.html                  # Estrutura HTML das Telas 1 e 2 + Modais
├── style.css                   # Folha de estilos completa com tema escuro e glassmorphism
├── app.js                      # Lógica da aplicação, navegação por teclado e filtros
├── server.js                   # Servidor Node.js para assets, uploads e proxy da planilha
├── google_apps_script.js       # Script de integração para Google Sheets (Webhook doPost)
├── sync_drive.py               # Script Python de sincronização de fotos do Google Drive
├── Sincronizar_Fotos_Drive.bat # Atalho de execução rápida para sincronização de fotos
├── image_map.json              # Mapa indexado de fotos e referências
├── images/                     # Diretório de fotos das referências
└── README.md                   # Documentação do projeto
```

---

Desenvolvido com excelência por **Oneda Ficha Pro Team**.
