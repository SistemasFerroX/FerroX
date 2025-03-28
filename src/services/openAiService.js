import OpenAI from "openai";
import config from "../config/env.js";

const client = new OpenAI({
  apiKey: config.CHATGPT_API_KEY,
});

const OpenAiService = async (message) => {
  try {
    // Se define el contexto del asistente en el mensaje del sistema.
    const response = await client.chat.completions.create({
      messages: [
        { 
          role: 'system', 
          content: 'Eres un asistente experto en la industria del acero y servicios para el sector metalmecánico en Colombia. Ayuda al usuario a resolver dudas y brindar soporte técnico. Trabajas para la empresa Ferraceros y recuerda que los products que manejamos son: Vigas y perfiles estructurales, Láminas y placas de acero,  Canastillas Pasajuntas, Acero para refuerzo (varillas, mallas),  Ejes y láminas de grado de ingeniería, Láminas antidesgaste' 
        },
        { role: 'user', content: message }
      ],
      model: 'gpt-4o-mini'
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error en OpenAiService:", error);
  }
};

export default OpenAiService;
