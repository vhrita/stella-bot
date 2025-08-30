# ☀️ Stella Bot ✨

*Uma centelha de Sol para o servidor WINX.*

---

## 🧚‍♀️ A Lenda do Grupo

Este projeto é uma homenagem mágica ao grupo de Discord **WINX**, um lugar onde amigos se reúnem para jogar e compartilhar histórias desde 2016. Para celebrar essa longa jornada de amizade, nossos bots são inspirados nas fadas que dão nome à nossa comunidade.

**Stella** é a nossa Fada do Sol Brilhante, trazendo luz, moda e criatividade para o servidor. Cada comando e cada resposta foram pensados para refletir sua personalidade radiante e seu poder mágico.

## ⚙️ Funcionalidades Mágicas

Atualmente, a principal magia de Stella é dar vida à imaginação.

-   `/imagine [prompt]`
    -   **Descrição:** Sussurre uma ideia para a Stella, e ela canalizará a energia do Sol para criar uma imagem única a partir do seu texto.
    -   **Como funciona:** O comando se conecta a um fluxo de trabalho n8n, que cuida da geração da imagem via IA e a retorna diretamente para o canal.

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
