# Changelog

## [1.1.0] - 2024-09-03

### ✨ Melhorias Implementadas

#### Sistema de Timeout Configurável
- ✅ Timeout baseado em variáveis de ambiente
- ✅ Cálculo dinâmico: base + steps + resolução + CFG
- ✅ Configuração flexível de 30min a 2h para modelos XL
- ✅ Logging detalhado de timeout calculado

#### Sistema de Progresso Avançado
- ✅ Monitoramento com performance stats (CPU, memória, GPU)
- ✅ Estatísticas de imagem (resolução, canais de cor)
- ✅ Tratamento de erros específicos com orientações
- ✅ Interface Discord aprimorada com status visual

#### Limpeza e Qualidade do Código
- ✅ Removido arquivo de backup desnecessário (`imagine-simple-backup.ts`)
- ✅ Corrigido import não utilizado (`getDefaultModel`)
- ✅ Otimizado callback de progresso removendo atribuições desnecessárias
- ✅ Configuração ESLint atualizada para v9 com TypeScript
- ✅ Scripts npm organizados com pré-commit, Docker e limpeza

#### Configuração e Deploy
- ✅ Docker Compose atualizado (removido `version` obsoleto)
- ✅ `.dockerignore` otimizado para imagens menores
- ✅ Scripts de build, lint e typecheck funcionando perfeitamente
- ✅ Documentação atualizada

#### Performance e Timeout
- ✅ `AI_TIMEOUT_BASE=1800` (30min base)
- ✅ `AI_TIMEOUT_PER_STEP=20` (20s por step)
- ✅ `AI_TIMEOUT_PER_MP=90` (90s por megapixel)
- ✅ `AI_TIMEOUT_HIGH_CFG=45` (penalidade CFG alto)
- ✅ `AI_TIMEOUT_MAX=7200` (2h máximo)

### 🔧 Configuração das Variáveis de Ambiente

```env
# Timeouts Dinâmicos (em segundos)
AI_TIMEOUT_BASE=1800           # 30 minutos base
AI_TIMEOUT_PER_STEP=20         # 20s adicional por step
AI_TIMEOUT_PER_MP=90           # 90s adicional por megapixel
AI_TIMEOUT_HIGH_CFG=45         # Penalidade para CFG > 12
AI_TIMEOUT_MAX=7200            # 2 horas máximo
```

### 📊 Status dos Comandos

- ✅ `/imagine` - Funcional com fallback N8N
- ✅ `/imagine-pro` - Funcional com IA local + fallback
- ✅ `/models` - Lista modelos disponíveis
- ✅ Sistema de progresso em tempo real
- ✅ Cancelamento de tarefas
- ✅ Tratamento de erros avançado

### 🚀 Como Usar

```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm start

# Docker
docker-compose up --build

# Verificações
npm run typecheck
npm run lint
npm run pre-commit
```

### 🎯 Próximos Passos

- Sistema pronto para produção
- Todos os testes passando
- Docker otimizado
- Código limpo e documentado
- Timeouts configuráveis resolvem problemas com modelos XL
