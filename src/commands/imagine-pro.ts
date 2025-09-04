import { 
  SlashCommandBuilder, 
  CommandInteraction, 
  AttachmentBuilder, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import { generateImage } from '../core/n8n.js';
import { 
  isLocalAIOnline, 
  getAvailableModels, 
  generateImageLocalWithProgressAndMonitor, 
  buildLocalRequest,
  cancelLocalTask 
} from '../core/local-ai.js';
import { logger } from '../core/logger.js';
import { createErrorEmbed, createImageEmbed } from '../core/embeds.js';
import { isSuperUser } from '../core/utils.js';
import { TaskProgress, TaskProgressMonitor } from '../core/types.js';
import { config } from '../core/config.js';

export const command = {
  data: new SlashCommandBuilder()
    .setName('imagine-pro')
    .setDescription('🔧 Geração avançada com controle total dos parâmetros técnicos')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('Descrição da imagem desejada (em inglês)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('model')
        .setDescription('Modelo de IA específico (deixe vazio para auto-seleção)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('size')
        .setDescription('Resolução da imagem (padrão: 1024x1024)')
        .setRequired(false)
        .addChoices(
          { name: '📱 512x512 (Rápido)', value: '512x512' },
          { name: '🖼️ 1024x1024 (Padrão)', value: '1024x1024' },
          { name: '📐 1152x896 (Paisagem)', value: '1152x896' },
          { name: '📏 896x1152 (Retrato)', value: '896x1152' },
          { name: '🖥️ 1280x720 (16:9)', value: '1280x720' },
          { name: '📺 1920x1080 (Full HD)', value: '1920x1080' }
        )
    )
    .addIntegerOption(option =>
      option.setName('steps')
        .setDescription('Número de steps de inferência (10-100, padrão: 20)')
        .setRequired(false)
        .setMinValue(10)
        .setMaxValue(100)
    )
    .addNumberOption(option =>
      option.setName('cfg')
        .setDescription('CFG Scale - força da aderência ao prompt (1.0-20.0, padrão: 7.5)')
        .setRequired(false)
        .setMinValue(1.0)
        .setMaxValue(20.0)
    )
    .addIntegerOption(option =>
      option.setName('seed')
        .setDescription('Seed para reproduzibilidade (deixe vazio para aleatório)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(2147483647)
    )
    .addStringOption(option =>
      option.setName('scheduler')
        .setDescription('Algoritmo de sampling (padrão: auto)')
        .setRequired(false)
        .addChoices(
          { name: '🔄 Auto (Recomendado)', value: 'auto' },
          { name: '⚡ DPM++ 2M Karras', value: 'DPM++ 2M Karras' },
          { name: '🎯 Euler Ancestral', value: 'Euler a' },
          { name: '🔀 DDIM', value: 'DDIM' },
          { name: '🌊 LMS', value: 'LMS' }
        )
    )
    .addStringOption(option =>
      option.setName('negative_prompt')
        .setDescription('Prompt negativo - o que NÃO deve aparecer na imagem')
        .setRequired(false)
    )
    .addNumberOption(option =>
      option.setName('eta')
        .setDescription('Parâmetro ETA para alguns schedulers (0.0-1.0, padrão: 0.0)')
        .setRequired(false)
        .setMinValue(0.0)
        .setMaxValue(1.0)
    )
    .addBooleanOption(option =>
      option.setName('attention_slicing')
        .setDescription('Usar attention slicing (reduz uso de VRAM, padrão: true)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('vae_slicing')
        .setDescription('Usar VAE slicing (reduz uso de VRAM, padrão: true)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('cpu_offload')
        .setDescription('Usar CPU offload (economia máxima de VRAM, mais lento)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('enhance_sharpness')
        .setDescription('Melhorar nitidez da imagem final')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('enhance_contrast')
        .setDescription('Melhorar contraste da imagem final')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('enhance_color')
        .setDescription('Melhorar saturação de cores')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('enhance_brightness')
        .setDescription('Ajustar brilho automaticamente')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('unsharp_mask')
        .setDescription('Aplicar máscara de nitidez avançada')
        .setRequired(false)
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const prompt = interaction.options.getString('prompt', true);
    const model = interaction.options.getString('model');
    const size = interaction.options.getString('size');
    const steps = interaction.options.getInteger('steps');
    const cfg = interaction.options.getNumber('cfg');
    const seed = interaction.options.getInteger('seed');
    const scheduler = interaction.options.getString('scheduler');
    const negativePrompt = interaction.options.getString('negative_prompt');
    const eta = interaction.options.getNumber('eta');
    const attentionSlicing = interaction.options.getBoolean('attention_slicing');
    const vaeSlicing = interaction.options.getBoolean('vae_slicing');
    const cpuOffload = interaction.options.getBoolean('cpu_offload');
    const enhanceSharpness = interaction.options.getBoolean('enhance_sharpness');
    const enhanceContrast = interaction.options.getBoolean('enhance_contrast');
    const enhanceColor = interaction.options.getBoolean('enhance_color');
    const enhanceBrightness = interaction.options.getBoolean('enhance_brightness');
    const unsharpMask = interaction.options.getBoolean('unsharp_mask');

    const { user, channelId } = interaction;
    const isUserSuper = isSuperUser(user);

    // Valores padrão
    const [width, height] = (size || '1024x1024').split('x').map(Number);
    const finalSteps = steps || 20;
    const finalCfg = cfg || 7.5;
    const finalScheduler = scheduler === 'auto' ? undefined : scheduler;

    // Resposta inicial
    const loadingEmbed = new EmbedBuilder()
      .setColor(0x7289DA)
      .setTitle('🔧 Iniciando Geração Avançada')
      .setDescription(`**Prompt:** ${prompt}\n\n🔍 Verificando serviços disponíveis...`)
      .setTimestamp()
      .setFooter({ text: `Solicitado por ${user.username}`, iconURL: user.displayAvatarURL() });

    await interaction.reply({ embeds: [loadingEmbed] });

    try {
      // Verificar se serviço local está online
      const localOnline = await isLocalAIOnline();
      
      if (localOnline) {
        loadingEmbed.setDescription(`**Prompt:** ${prompt}\n\n🖥️ **Serviço Local Online** ✅\n🔄 Gerando com IA local...`);
        await interaction.editReply({ embeds: [loadingEmbed] });

        try {
          // Buscar modelos disponíveis se não especificado
          const availableModels = await getAvailableModels();
          const selectedModel = model || (availableModels.length > 0 ? availableModels[0].slug : 'stable-diffusion-v1.5');

          const request = buildLocalRequest(prompt, selectedModel, {
            width,
            height,
            num_inference_steps: finalSteps,
            guidance_scale: finalCfg,
            seed: seed || undefined,
            scheduler: finalScheduler,
            negative_prompt: negativePrompt || undefined,
            eta: eta || undefined,
            use_attention_slicing: attentionSlicing ?? true,
            use_vae_slicing: vaeSlicing ?? true,
            use_cpu_offload: cpuOffload || false,
            enhance_sharpness: enhanceSharpness || false,
            enhance_contrast: enhanceContrast || false,
            enhance_color: enhanceColor || false,
            enhance_brightness: enhanceBrightness || false,
            apply_unsharp_mask: unsharpMask || false,
          });

          // Criar botão de cancelamento
          const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_generation')
            .setLabel('🚫 Cancelar')
            .setStyle(ButtonStyle.Danger);

          const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(cancelButton);

          let currentTaskId: string | null = null;
          let cancelled = false;
          let monitor: TaskProgressMonitor | null = null;

          // Callback de progresso
          const progressCallback = (progress: TaskProgress) => {
            if (cancelled) return;

            try {
              let progressText = '🔄 Processando...';
              let progressPercentage = 0;

              if (progress.task_id && !currentTaskId) {
                currentTaskId = progress.task_id;
              }

              if (progress.progress !== undefined) {
                // Verificar se o progresso já está em porcentagem (0-100) ou decimal (0-1)
                progressPercentage = progress.progress > 1 ? 
                  Math.round(progress.progress) : 
                  Math.round(progress.progress * 100);
                
                // Garantir que não passe de 100%
                progressPercentage = Math.min(progressPercentage, 100);
                
                progressText = `🎨 Gerando imagem... ${progressPercentage}%`;
                
                if (progress.current_step && progress.total_steps) {
                  progressText += ` (${progress.current_step}/${progress.total_steps} steps)`;
                }
              }

              // Se completou, não continuar atualizando
              if (progress.status === 'completed' || progressPercentage >= 100) {
                return;
              }

              const progressEmbed = new EmbedBuilder()
                .setColor(0x7289DA)
                .setTitle('🔧 Geração Avançada em Andamento')
                .setDescription(`**Prompt:** ${prompt}

${progressText}`)
                .addFields([
                  { name: 'Modelo', value: selectedModel, inline: true },
                  { name: 'Steps', value: finalSteps.toString(), inline: true },
                  { name: 'CFG', value: finalCfg.toString(), inline: true }
                ])
                .setTimestamp()
                .setFooter({ text: `Solicitado por ${user.username}`, iconURL: user.displayAvatarURL() });

              interaction.editReply({ 
                embeds: [progressEmbed], 
                components: [row] 
              }).catch(err => logger.error('Erro ao atualizar progresso:', err));
            } catch (error) {
              logger.error('Erro no callback de progresso:', error);
            }
          };

          // Adicionar botão de cancelamento à mensagem inicial
          loadingEmbed.setDescription(`**Prompt:** ${prompt}

🖥️ **Serviço Local Online** ✅
🔄 Iniciando geração avançada...`);
          await interaction.editReply({ embeds: [loadingEmbed], components: [row] });

          // Configurar collector para o botão de cancelamento
          const collector = interaction.channel?.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000, // 5 minutos
            filter: (i) => i.customId === 'cancel_generation' && i.user.id === user.id
          });

          collector?.on('collect', async (buttonInteraction) => {
            if (currentTaskId && !cancelled) {
              cancelled = true;
              
              try {
                await buttonInteraction.deferUpdate();
                
                // Parar o monitor WebSocket imediatamente
                if (monitor) {
                  monitor.forceStop();
                }
                
                // Cancelar a tarefa no servidor usando DELETE
                const success = await cancelLocalTask(currentTaskId);
                
                let description;
                if (success) {
                  description = `**Prompt:** ${prompt}

✅ **Cancelamento enviado com sucesso**

📋 A tarefa foi removida ou marcada para cancelamento dependendo do estado:
• **PENDING** → Cancelada imediatamente
• **PROCESSING** → Será interrompida na próxima oportunidade
• **COMPLETED/FAILED** → Já finalizada (não pode cancelar)`;
                } else {
                  description = `**Prompt:** ${prompt}

⚠️ **Não foi possível cancelar**

A tarefa pode já ter terminado ou ocorreu um erro de comunicação com o servidor.`;
                }
                
                const cancelEmbed = new EmbedBuilder()
                  .setColor(0xFF6B35)
                  .setTitle('🚫 Cancelamento Solicitado')
                  .setDescription(description)
                  .setTimestamp()
                  .setFooter({ text: `Solicitado por ${user.username}`, iconURL: user.displayAvatarURL() });

                await interaction.editReply({ 
                  embeds: [cancelEmbed], 
                  components: [] 
                });
                
                collector?.stop();
                
                // Log para debug
                logger.log(`🚫 Usuário ${user.username} cancelou tarefa avançada ${currentTaskId}`);
                
              } catch (error) {
                logger.error('Erro ao cancelar geração avançada:', error);
                // Tentar responder mesmo com erro
                try {
                  const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF6B35)
                    .setTitle('⚠️ Erro no Cancelamento')
                    .setDescription(`**Prompt:** ${prompt}

❌ Erro ao cancelar a geração avançada`)
                    .setTimestamp();

                  await interaction.editReply({ 
                    embeds: [errorEmbed], 
                    components: [] 
                  });
                } catch (replyError) {
                  logger.error('Erro ao enviar mensagem de erro de cancelamento:', replyError);
                }
              }
            }
          });

          const { data: result, monitor: progressMonitor } = await generateImageLocalWithProgressAndMonitor(request, progressCallback);
          monitor = progressMonitor;
          
          // Parar o collector
          collector?.stop();
          
          if (cancelled) {
            return; // Já foi tratado no collector
          }
          
          // Se a tarefa foi cancelada pelo servidor, não tratar como erro
          if (result?.error?.type === 'cancelled') {
            const cancelEmbed = new EmbedBuilder()
              .setColor(0xFF6B35)
              .setTitle('🚫 Geração Avançada Cancelada')
              .setDescription(`**Prompt:** ${prompt}

✅ Tarefa cancelada com sucesso`)
              .setTimestamp()
              .setFooter({ text: `Cancelado por ${user.username}`, iconURL: user.displayAvatarURL() });

            await interaction.editReply({ 
              embeds: [cancelEmbed], 
              components: [] 
            });
            return;
          }
          
          if (!result?.imageUrl) {
            throw new Error('Falha na geração local');
          }

          // Baixar como anexo se for URL local
          if (result.imageUrl?.includes(config.LOCAL_AI_URL || '')) {
            try {
              logger.log('📎 Baixando imagem local como anexo...');
              
              const response = await fetch(result.imageUrl, {
                headers: { 'ngrok-skip-browser-warning': 'true' }
              });
              
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const imageBuffer = Buffer.from(arrayBuffer);
                
                const attachment = new AttachmentBuilder(imageBuffer, { name: 'stella-image.png' });
                
                const resultEmbed = createImageEmbed(
                  user.username,
                  user.displayAvatarURL(),
                  result.metadata
                );

                await interaction.editReply({ 
                  embeds: [resultEmbed],
                  files: [attachment],
                  components: [] // Remove buttons
                });
                return;
              }
            } catch (attachmentError) {
              logger.error('Erro ao baixar imagem como anexo:', attachmentError);
            }
          }

          // Fallback para URL se anexo falhar
          const resultEmbed = createImageEmbed(
            user.username,
            user.displayAvatarURL(),
            result.metadata,
            result.imageUrl
          );

          await interaction.editReply({ 
            embeds: [resultEmbed], 
            components: [] // Remove buttons
          });
          return;

        } catch (localError) {
          logger.error('Erro na geração local:', localError);
          
          loadingEmbed.setDescription(`**Prompt:** ${prompt}\n\n❌ Falha no serviço local\n🔄 Tentando fallback para N8N...`);
          await interaction.editReply({ embeds: [loadingEmbed] });
        }
      } else {
        loadingEmbed.setDescription(`**Prompt:** ${prompt}\n\n⚠️ Serviço local offline\n🔄 Usando N8N como fallback...`);
        await interaction.editReply({ embeds: [loadingEmbed] });
      }

      // Fallback para N8N
      const n8nResult = await generateImage({
        prompt,
        userId: user.id,
        channelId,
        isSuperUser: isUserSuper,
      });
      
      if (!n8nResult) {
        throw new Error('Falha na geração via N8N');
      }

      // Verificar se houve erro de violação de conteúdo
      if (n8nResult.error?.type === 'content_policy_violation' && !isUserSuper) {
        const policyEmbed = createErrorEmbed(`🚫 **Conteúdo rejeitado pelas diretrizes**\n\n${n8nResult.error.reason}`);
        await interaction.editReply({ embeds: [policyEmbed] });
        return;
      }
      
      let embed;
      const files: AttachmentBuilder[] = [];

      if (n8nResult.type === 'url' && n8nResult.imageUrl) {
        embed = createImageEmbed(
          user.username,
          user.displayAvatarURL(),
          n8nResult.metadata,
          n8nResult.imageUrl
        );
      } else if (n8nResult.type === 'base64' && n8nResult.imageBuffer) {
        const attachment = new AttachmentBuilder(n8nResult.imageBuffer, { name: 'stella-image.png' });
        files.push(attachment);
        
        embed = createImageEmbed(
          user.username,
          user.displayAvatarURL(),
          n8nResult.metadata
        );
      } else {
        throw new Error('Formato de resposta inválido da API');
      }

      await interaction.editReply({ embeds: [embed], files });

    } catch (error) {
      logger.error('Erro na execução do comando imagine-pro:', error);
      
      const errorEmbed = createErrorEmbed('❌ **Erro na geração avançada**\n\nVerifique os parâmetros e tente novamente. Para parâmetros extremos, pode ser necessário ajustar as configurações.');
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};
