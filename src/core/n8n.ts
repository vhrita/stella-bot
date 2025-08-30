import { logger } from './logger.js';

const n8nUrl = process.env.N8N_IMAGINE_URL;
const n8nUsername = process.env.N8N_USERNAME;
const n8nPassword = process.env.N8N_PASSWORD;

interface ImaginePayload {
  prompt: string;
  userId: string;
  channelId: string;
}

export async function generateImage(payload: ImaginePayload): Promise<Buffer | null> {
  if (!n8nUrl || !n8nUsername || !n8nPassword) {
    logger.error('As variáveis de ambiente N8N_IMAGINE_URL, N8N_USERNAME e N8N_PASSWORD são obrigatórias para gerar imagens.');
    return null;
  }

  try {
    const credentials = Buffer.from(`${n8nUsername}:${n8nPassword}`).toString('base64');

    logger.log(`Enviando prompt para o n8n: "${payload.prompt}"`);
    const response = await fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Erro na chamada ao n8n: ${response.status} ${response.statusText}`, errorText);
      return null;
    }

    // Converte a resposta em um Buffer de dados binários
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    logger.log('Imagem binária recebida com sucesso do n8n.');
    return imageBuffer;

  } catch (error) {
    logger.error('Falha ao comunicar com o n8n:', error);
    return null;
  }
}
