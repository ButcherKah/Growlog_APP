# 🌱 GrowLog v2

Diário de cultivo indoor para celular. PWA — funciona offline, instala na tela inicial, não depende de servidor nem de conta.

---

## Instalação rápida (GitHub Pages)

1. Crie um repositório no GitHub (pode ser privado)
2. Suba os arquivos: `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.json`, `README.md`
3. Vá em **Settings → Pages → Branch: main → Save**
4. Aguarde ~1 min e acesse `https://seu-usuario.github.io/nome-do-repo`

---

## Instalar no celular como app

### iOS (Safari)
1. Abra o link do GitHub Pages no Safari
2. Toque no botão de compartilhar (□↑)
3. Toque em **"Adicionar à Tela de Início"**
4. O app abre em tela cheia, sem barra do navegador

### Android (Chrome)
1. Abra o link no Chrome
2. Toque nos 3 pontos → **"Adicionar à tela inicial"**
3. Ou aguarde o banner automático de instalação

> **Importante:** sempre abra pelo ícone instalado, não pelo navegador. Os dados ficam salvos localmente no celular via IndexedDB — atualizações no GitHub não apagam seus registros.

---

## Como usar

### 1. Cadastrar uma planta

Toque em **Nova Planta** (botão + ou ação rápida na Home).

O modal tem **3 abas:**

#### 🌱 Básico
| Campo | O que preencher |
|---|---|
| Nome / Strain | Nome da planta, ex: `Lemon Drizzle #2` |
| Tipo | **Auto** (automática) ou **Foto** (fotoperíodo) |
| Data de início | Data em que plantou / germinou |
| Ciclo de rega | Quantas regas **com nutriente** + quantas **sem**. Ex: `2 + 1` |
| Semanas de Vega | Estimativa de semanas no vegetativo (usado no countdown) |
| Semanas de Flor | Estimativa de semanas na floração (usado no countdown) |
| Observações | Banco de sementes, notas gerais |

#### 🪱 Solo
Escolha entre **Inerte** ou **Orgânico**:
- **Inerte:** substrato/marca (ex: `Coco coir + perlita 70/30`) e notas
- **Orgânico:** receita completa (proporções, ingredientes) e notas de maturação

#### 💡 Setup
| Campo | Exemplo |
|---|---|
| Tamanho da tenda | `60×60×140 cm` |
| LED — Modelo | `QB240` |
| Tipo de LED | `LM301H` |
| Potência real | `120 W` |
| Exaustor | `4" 190 m³/h` |
| Ventilador | `Clip fan 15cm` |
| Temporizador | `Outlet timer 18/6` |
| Notas | Filtro de carvão, controlador de temperatura... |

---

### 2. Navegar para a planta

Na Home, toque no card da planta. A tela de detalhe mostra:

- **Ribbon de estágio** — estágio atual, dias de vida, semana no estágio. Toque no lápis para alterar
- **Card de próxima rega** — indica se a próxima rega é com ou sem nutriente, baseado no ciclo configurado e no histórico de regas registradas
- **Countdown de colheita** — barra de progresso até a data estimada (aparece quando você preenche semanas de veg + flor)
- **Card VPD** — VPD calculado do último registro com temperatura e umidade

---

### 3. Adicionar um registro

Toque em **+ Registro**, **💧 Rega** ou **🌡️ Clima** na tela da planta.

Escolha o **tipo de ação** no topo do modal:

| Tipo | O que registra |
|---|---|
| 📋 Geral | Ambiente + luz + rega (tudo junto) |
| 💧 Rega | Ambiente + dados de rega |
| 🌡️ Clima | Ambiente + luz |
| 💡 Luz | Só dados de luz |
| ✂️ Poda | Técnica (topping, fimming...) + nós removidos |
| 🪢 LST | Técnica (LST, SCROG, supercrop...) + descrição |
| 🍃 Defoliação | Folhas removidas |
| 🪴 Transplante | Vaso de origem → destino + substrato |
| 🚿 Flush | Volume e pH da água de lavagem |
| 🧪 Runoff | pH e EC do escorrimento |

**Campos calculados automaticamente:**
- **PPFD** — calculado a partir do Lux (fator LM301H: 0.0185)
- **DLI** — calculado a partir do PPFD + fotoperíodo (horário liga/apaga)
- **VPD** — calculado a partir de Temperatura + Umidade, com zona colorida

**Nutrientes:** ative o toggle "Adicionar nutrientes" dentro da seção de rega, e adicione quantos quiser (nome + ml/L).

---

### 4. Badges de faixa de referência 🟢🟡🔴

Cada registro exibe badges coloridos comparando seus valores com as tabelas de referência para **LM301H indoor sem CO₂**:

| Badge | Significado |
|---|---|
| 🟢 `X.X–X.X` | Dentro da faixa ideal |
| 🟡 `X.X–X.X` | Próximo do limite (tolerância 10%) |
| 🔴 `X.X–X.X` | Fora da faixa ideal |

Os parâmetros avaliados são: **pH, EC, VPD, Temperatura, Umidade Relativa**. A faixa muda automaticamente conforme a semana do estágio e o tipo da planta (auto ou fotoperíodo).

> Passe o dedo sobre o badge para ver a faixa completa daquela semana.

---

### 5. Editar um registro

Na tela de detalhe da planta, toque em qualquer registro para abrir os detalhes. Na parte inferior aparecem três botões:

- **🗑 Excluir** — remove permanentemente
- **✏️ Editar** — reabre o formulário preenchido com os dados do registro para edição
- **Fechar** — volta sem alterar

---

### 6. Alterar o estágio

Na tela da planta, toque no **lápis** no ribbon de estágio. Selecione o novo estágio e salve. Os dias e semanas são recalculados automaticamente a partir da data de mudança.

Ao marcar **Colheita**, o relatório de colheita abre automaticamente.

---

### 7. Relatório de colheita

Abre automaticamente ao marcar estágio **Colheita**, ou manualmente pelo modal de estágio. Mostra:

- Resumo completo do ciclo (duração, regas, água total, treinamentos)
- Médias ambientais (temp, UR, VPD, pH, EC, PPFD)
- Linha do tempo de estágios com duração de cada fase
- Campos para peso úmido, peso seco, avaliação (1–5⭐) e notas finais

Exporta como CSV completo com todos os registros.

---

### 8. Backup e exportação

Acesse via ícone **Dados** na barra inferior ou **Backup / CSV** na Home.

| Opção | Formato | Uso |
|---|---|---|
| Backup JSON | `.json` | Backup completo — importar em outro dispositivo |
| Importar Backup | `.json` | Restaura todos os dados de um backup anterior |
| Exportar CSV | `.csv` | Planilha com todos os registros de todas as plantas |
| CSV da planta | `.csv` | Na tela da planta → botão 📊 CSV |

> **Faça backup antes de desinstalar o app ou trocar de celular.** Os dados ficam apenas no dispositivo.

---

## Persistência de dados

O app usa **IndexedDB** como storage principal, com fallback duplo para localStorage. IndexedDB tem quota muito maior (~50% do disco livre) e não é limpo pelo Safari no iOS como o localStorage antigo.

Mesmo assim, **dados locais podem ser perdidos** se você:
- Desinstalar o app
- Limpar dados do navegador / Safari manualmente
- Trocar de celular sem fazer backup

**Recomendação:** faça backup JSON uma vez por semana.

---

## Estrutura de arquivos

```
├── index.html      — Toda a estrutura HTML e modais
├── app.js          — Toda a lógica: DB, cálculos, renders, modais
├── styles.css      — Tema dark, componentes, responsivo
├── sw.js           — Service Worker (cache offline)
└── manifest.json   — Configuração PWA (ícone, nome, cor)
```

Não há dependências externas além de:
- Google Fonts (DM Mono + Familjen Grotesk) — carregadas online, dispensáveis offline
- Service Worker nativo do browser para cache

---

## Tabelas de referência embutidas

As tabelas são calibradas para **LEDs LM301H, cultivo indoor, sem suplementação de CO₂**.

### Automáticas
| Semana | VPD | UR | Temp | EC | pH |
|---|---|---|---|---|---|
| 1 | 0.4–0.8 | 70–80% | 24–26°C | 0.2–0.5 | 5.8–6.0 |
| 2 | 0.5–0.8 | 65–75% | 24–27°C | 0.2–0.5 | 5.8–6.0 |
| 3–4 | 0.6–1.0 | 58–70% | 24–28°C | 0.5–1.2 | 5.8–6.1 |
| 5–6 | 0.9–1.2 | 50–65% | 24–28°C | 1.2–2.0 | 5.9–6.2 |
| 7–8 | 1.1–1.4 | 40–55% | 22–27°C | 1.8–2.4 | 6.0–6.3 |
| 9–10 | 1.2–1.5 | 40–48% | 22–26°C | 2.0–2.8 | 6.1–6.4 |
| 11+ | 1.3–1.5 | 35–45% | 21–26°C | 0.2–0.8 | 6.0–6.3 |

### Fotoperíodo
| Semana | VPD | UR | Temp | EC | pH |
|---|---|---|---|---|---|
| 1–2 | 0.4–0.8 | 70–80% | 24–26°C | 0.2–0.5 | 5.8–6.0 |
| 3–6 | 0.6–1.2 | 50–70% | 24–28°C | 0.5–1.6 | 5.8–6.2 |
| 7–10 | 1.0–1.4 | 45–58% | 23–28°C | 1.6–2.4 | 6.0–6.3 |
| 11–13 | 1.2–1.5 | 38–50% | 21–27°C | 2.0–2.8 | 6.1–6.4 |
| 14–16 | 1.3–1.6 | 35–45% | 20–26°C | 2.4–3.2 | 6.2–6.5 |
| 17+ | 1.3–1.6 | 35–45% | 20–26°C | 0.2–0.8 | 6.0–6.3 |

---

## Changelog

### v2.0
- IndexedDB como storage principal (mais seguro no iOS)
- Edição de registros (✏️ no detalhe)
- Ciclo de rega personalizável (N com + M sem)
- Card de próxima rega na tela da planta
- Cadastro de solo (inerte/orgânico com receita)
- Cadastro de setup (tenda, LED, exaustor, ventilador, temporizador)
- Badges de faixa de referência em pH, EC, VPD, Temp e UR
- Tabelas de referência embutidas (auto + fotoperíodo, LM301H)

### v1.0
- Cadastro de plantas e registros
- VPD, PPFD, DLI calculados automaticamente
- Timeline visual do ciclo
- Countdown de colheita
- Relatório de colheita com médias
- Export CSV e backup JSON
