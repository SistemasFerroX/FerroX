import whatsappService from './whatsappService.js';
import googleSheetsService from './googleSheetsService.js';
import openAiService from './openAiService.js';

class MessageHandler {
  constructor() {
    // Estado para las conversaciones de cotización
    this.cotizacionState = {};
    // Estado para las conversaciones de asistencia (consultas de soporte)
    this.assistandState = {};
    // Estado para el modo soporte (consulta directa con ChatGPT)
    this.soporteState = {};
    // Historial de conversación (para dar contexto a ChatGPT y detectar primer contacto)
    this.conversationHistory = {};
  }

  async handleIncomingMessage(message, senderInfo) {
    if (message?.type === 'text') {
      const incomingMessage = message.text.body.trim();
      
      // Si es el primer mensaje del usuario, se envía el saludo y menú inicial
      if (!this.conversationHistory[message.from]) {
        this.conversationHistory[message.from] = [];
        await this.sendWelcomeMessage(message.from, message.id, senderInfo);
        await this.sendWelcomeMenu(message.from);
        await whatsappService.markAsRead(message.id);
        return;
      }
      
      // Guarda el mensaje en el historial
      this.conversationHistory[message.from].push(`Usuario: ${incomingMessage}`);
      
      // Finaliza modo soporte/asistencia si escribe "salir"
      if ((this.soporteState[message.from] || this.assistandState[message.from]) &&
          incomingMessage.toLowerCase() === 'salir') {
        delete this.soporteState[message.from];
        delete this.assistandState[message.from];
        await whatsappService.sendMessage(
          message.from, 
          "Has salido del modo soporte. ¡Gracias por comunicarte!", 
          message.id
        );
        await whatsappService.markAsRead(message.id);
        return;
      }
      
      // Modo soporte: redirige a ChatGPT con historial
      if (this.soporteState[message.from]) {
        const chatResponse = await this.handleChatGPT(incomingMessage, this.conversationHistory[message.from]);
        this.conversationHistory[message.from].push(`Asistente: ${chatResponse}`);
        await whatsappService.sendMessage(message.from, chatResponse, message.id);
        await whatsappService.markAsRead(message.id);
        return;
      }
      
      // Modo asistencia (consultar)
      if (this.assistandState[message.from]) {
        const chatResponse = await this.handleChatGPT(incomingMessage, this.conversationHistory[message.from]);
        this.conversationHistory[message.from].push(`Asistente: ${chatResponse}`);
        await whatsappService.sendMessage(message.from, chatResponse, message.id);
        await whatsappService.markAsRead(message.id);
        return;
      }
      
      // Flujo de cotización
      if (this.cotizacionState[message.from]) {
        await this.handleCotizacionConversation(message.from, incomingMessage);
        await whatsappService.markAsRead(message.id);
        return;
      }
      
      // Flujo normal: comandos específicos
      if (incomingMessage.toLowerCase() === 'audio') {
        await this.sendAudio(message.from);
      } else if (incomingMessage.toLowerCase() === 'imagen') {
        await this.sendImage(message.from);
      } else if (incomingMessage.toLowerCase() === 'video') {
        await this.sendVideo(message.from);
      } else if (incomingMessage.toLowerCase() === 'documento') {
        await this.sendDocument(message.from);
      } else {
        const response = `Echo: ${message.text.body}`;
        await whatsappService.sendMessage(message.from, response, message.id);
      }
      await whatsappService.markAsRead(message.id);
    } else if (message?.type === 'interactive') {
      const opcion = message?.interactive?.button_reply?.title?.toLowerCase().trim();
      if (opcion) {
        await this.handleMenuOption(message.from, opcion, senderInfo);
      } else {
        await whatsappService.sendMessage(message.from, "Opción inválida, intenta de nuevo.", message.id);
      }
      await whatsappService.markAsRead(message.id);
    }
  }

  isGreeting(message) {
    const greetings = ["hola", "hello", "hi", "buenas tardes"];
    return greetings.includes(message);
  }

  getSenderName(senderInfo) {
    return senderInfo?.profile?.name || senderInfo?.wa_id || "Desconocido";
  }

  async sendWelcomeMessage(to, messageId, senderInfo) {
    const name = this.getSenderName(senderInfo);
    const welcomeMessage = `👋 Hola ${name}, Bienvenido(a) a Ferraceros, su aliado en soluciones de acero para la industria metalmecánica e infraestructura en Colombia💪🇨🇴. ¿En qué puedo ayudarle hoy? Por favor, seleccione una opción:`;
    await whatsappService.sendMessage(to, welcomeMessage, messageId);
  }

  async sendWelcomeMenu(to) {
    const menuMessage = "Elige una opción";
    const buttons = [
      { type: 'reply', reply: { id: 'option_1', title: 'Catalogo' } },
      { type: 'reply', reply: { id: 'option_2', title: 'Cotizar' } },
      { type: 'reply', reply: { id: 'option_3', title: 'Consultar' } }
    ];
    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  // Menú final que se envía después de terminar una cotización
  async sendFinalMenu(to) {
    const menuMessage = "Elige una opción";
    // Opciones: Catalogo, Cotizar, Consultar (que regresa al menú sin saludo)
    const buttons = [
      { type: 'reply', reply: { id: 'option_1', title: 'Catalogo' } },
      { type: 'reply', reply: { id: 'option_2', title: 'Cotizar' } },
      { type: 'reply', reply: { id: 'option_3', title: 'Consultar' } }
    ];
    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  async handleMenuOption(to, option, senderInfo) {
    let response;
    switch (option) {
      case 'catalogo':
        await this.sendCatalog(to);
        break;
      case 'solicitar una cotización':
      case 'cotizar':
        await this.startCotizacion(to, senderInfo);
        break;
      case 'consultar':
        // Activa el modo asistencia para consultas y reinicia el historial si no existe
        this.assistandState[to] = { step: 'question' };
        this.conversationHistory[to] = this.conversationHistory[to] || [];
        response = 'Realiza tu consulta y escribe "salir" para finalizar el soporte';
        await whatsappService.sendMessage(to, response);
        break;
      case 'soporte':
        await this.startSoporte(to);
        break;
      case 'ubicación':
        response = 'Esta es nuestra Ubicación';
        await whatsappService.sendMessage(to, response);
        break;
      case 'volver':
        // Envía el menú final (sin saludo) para regresar a las opciones
        await this.sendFinalMenu(to);
        break;
      default:
        response = 'Lo siento, no entendí tu selección. Por favor, elige una de las opciones del menú.';
        await whatsappService.sendMessage(to, response);
    }
  }

  async sendCatalog(to) {
    const catalogUrl = 'https://ferraceros.com.co/wp-content/uploads/2025/03/CatalogoFerraceros21_02_25-comprimido-1.pdf';
    const caption = 'Explora nuestro catálogo para conocer otros productos y/o especificaciones técnicas';
    const type = 'document';
    await whatsappService.sendMediaMessage(to, type, catalogUrl, caption);
  }

  async sendAudio(to) {
    const mediaUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
    const caption = 'Esto es un audio';
    const type = 'audio';
    await whatsappService.sendMediaMessage(to, type, mediaUrl, caption);
  }

  async sendImage(to) {
    const mediaUrl = 'https://dummyimage.com/800x600/000/fff.png&text=Acero';
    const caption = 'Esto es una imagen';
    const type = 'image';
    await whatsappService.sendMediaMessage(to, type, mediaUrl, caption);
  }

  async sendVideo(to) {
    const mediaUrl = 'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4';
    const caption = 'Esto es un video';
    const type = 'video';
    await whatsappService.sendMediaMessage(to, type, mediaUrl, caption);
  }

  async sendDocument(to) {
    const mediaUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    const caption = 'Esto es un documento';
    const type = 'document';
    await whatsappService.sendMediaMessage(to, type, mediaUrl, caption);
  }

  async startCotizacion(to, senderInfo) {
    const name = this.getSenderName(senderInfo);
    // Inicializa el estado de la cotización para este usuario, incluyendo el nombre
    this.cotizacionState[to] = {
      stage: 'product',
      product: '',
      quantity: '',
      unit: '',  // Nuevo campo para la unidad
      city: '',
      name
    };
    const messageText = '¡Entendido! Para enviarle una cotización precisa, por favor indíqueme:\n- Tipo de producto (ejemplo: láminas, tubos, vigas)';
    await whatsappService.sendMessage(to, messageText);
  }

  async startSoporte(to) {
    this.soporteState[to] = true;
    this.conversationHistory[to] = this.conversationHistory[to] || [];
    const welcomeSoporte = "Bienvenido al soporte de Ferraceros. Cuéntame, ¿en qué puedo ayudarte? (Escribe 'salir' para terminar el soporte)";
    await whatsappService.sendMessage(to, welcomeSoporte);
  }

  async handleChatGPT(userMessage, history = []) {
    try {
      const contexto = history.join('\n');
      const prompt = `Contexto previo:\n${contexto}\nPregunta: ${userMessage}`;
      const response = await openAiService(prompt);
      return response || "Lo siento, no tengo respuesta en este momento.";
    } catch (error) {
      console.error("Error en handleChatGPT:", error);
      return "Lo siento, hubo un error procesando tu solicitud.";
    }
  }

  async handleCotizacionConversation(to, incomingMessage) {
    const state = this.cotizacionState[to];
    if (!state) return;

    console.log(`Estado actual para ${to}:`, state);
    console.log(`Mensaje recibido: "${incomingMessage}"`);

    if (state.stage === 'product') {
      state.product = incomingMessage;
      state.stage = 'quantity';
      const nextMessage = '- Cantidad (ejemplo: 800)';
      await whatsappService.sendMessage(to, nextMessage);
    } else if (state.stage === 'quantity') {
      state.quantity = incomingMessage;
      state.stage = 'unit';
      const nextMessage = '- Unidad (ejemplo: kilos, unidades, etc.)';
      await whatsappService.sendMessage(to, nextMessage);
    } else if (state.stage === 'unit') {
      state.unit = incomingMessage;
      state.stage = 'city';
      const nextMessage = '- Ciudad de entrega (ejemplo: Bogotá, Medellín)';
      await whatsappService.sendMessage(to, nextMessage);
    } else if (state.stage === 'city') {
      state.city = incomingMessage;
      const summary = `Resumen de su cotización:\nProducto: ${state.product}\nCantidad: ${state.quantity}\nUnidad: ${state.unit}\nCiudad: ${state.city}\nEn un momento se le responderá su cotización.`;
      await whatsappService.sendMessage(to, summary);
      
      // Orden de columnas en la hoja:
      // A: whatsapp, B: nombre, C: tipo, D: cantidad, E: unidad, F: ciudad, G: fecha
      await googleSheetsService([
        to,
        state.name,
        state.product,
        state.quantity,
        state.unit,
        state.city,
        new Date().toLocaleString()
      ]);
      
      console.log(`Cotización guardada para ${to}:`, state);
      delete this.cotizacionState[to];
      // Envía el menú final para que el usuario pueda elegir la siguiente acción
      await this.sendFinalMenu(to);
    }
  }
}

export default new MessageHandler();
