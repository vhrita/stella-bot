# ☀️ Stella Bot ✨

*Uma centelha de Sol para o servidor WINX.*

---

## 🧚‍♀️ A Lenda do Grupo

Este projeto é uma homenagem mágica ao grupo de Discord **WINX**, um lugar onde amigos se reúnem para jogar e compartilhar histórias desde 2016. Para celebrar essa longa jornada de amizade, nossos bots são inspirados nas fadas que dão nome à nossa comunidade.

**Stella** é a nossa Fada do Sol Brilhante, trazendo luz, moda e criatividade para o servidor. Cada comando e cada resposta foram pensados para refletir sua personalidade radiante e seu poder mágico.

## ⚙️ Funcionalidades Mágicas

Stella possui duas formas de canalizar a magia da criação:

### 🎨 Comandos de Geração de Imagens

-   `/imagine [prompt]`
    -   **Descrição:** A magia clássica da Stella! Crie imagens a partir de texto usando N8N.
    -   **Como funciona:** Conecta-se ao fluxo n8n para geração via Hugging Face e outros providers.
    -   **Ideal para:** Uso geral e quando o serviço local estiver offline.

-   `/imagine-pro [prompt] [quality] [size]`
    -   **Descrição:** Geração avançada com IA local + fallback automático para N8N.
    -   **Qualidade:** Rápido (20 steps), Equilibrado (50 steps), Alta Qualidade (80 steps)
    -   **Tamanhos:** 512x512, 768x768, 1024x1024, paisagem e retrato
    -   **Como funciona:** Tenta primeiro o serviço local (melhor qualidade), com fallback para N8N.
    -   **Ideal para:** Quando você quer a melhor qualidade possível.

-   `/imagine-live [prompt] [quality] [size]`
    -   **Descrição:** Geração com progresso em tempo real via WebSocket + cancelamento!
    -   **Recursos exclusivos:** 
      - 📊 Progresso em tempo real (0-100%)
      - 🛑 Botão de cancelamento durante a geração
      - 📋 Exibe Task ID para rastreamento
      - 🔄 Atualização automática via WebSocket
    -   **Como funciona:** Conecta via WebSocket para mostrar progresso da geração local.
    -   **Ideal para:** Acompanhar gerações longas e ter controle total sobre o processo.

## 🛠️ Ingredientes Mágicos (Stack)

A magia da Stella é forjada com as seguintes tecnologias:

-   **Node.js** & **TypeScript**
-   **discord.js** para a conexão com o mundo do Discord
-   **n8n** como a fonte do poder de geração de imagens
-   **Docker** para garantir que a magia funcione em qualquer lugar
-   **pnpm** para um gerenciamento de feitiços (pacotes) eficiente

## 🚀 Como Lançar a Magia (Setup Local)

Para executar a Stella em seu ambiente local, siga estes passos:

1.  **Clone o repositório** e instale as dependências:
    ```bash
    pnpm install
    ```

2.  **Crie um arquivo `.env`** a partir do exemplo. Ele guardará os segredos da Stella:
    ```bash
    cp .env.example .env
    ```

3.  **Preencha o `.env`** com suas credenciais do Discord e do n8n.

4.  **Inicie o bot** em modo de desenvolvimento:
    ```bash
    pnpm dev
    ```

## 🐳 Magia em um Container (Docker)

Para uma experiência mais encantada e isolada, use o Docker:

1.  **Construa a imagem da Stella:**
    ```bash
    docker build -t stella-bot .
    ```

2.  **Execute o container:**
    ```bash
    docker run --rm --name stella-bot --env-file .env stella-bot
    ```

---

> ✨ *Que a luz de Stella sempre ilumine suas ideias!* ✨
