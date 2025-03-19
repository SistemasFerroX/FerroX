import whatsappService from './whatsappService.js';
import googleSheetsService from './googleSheetsService.js';
import openAiService from './openAiService.js';

class MessageHandler {
  constructor() {
    // Estado para las conversaciones de cotización
    this.cotizacionState = {};
    // Estado para las conversaciones de asistencia (consultas de soporte)
    this.assistandState = {};
    // Estado para el modo soporte (puedes usar uno solo si lo prefieres)
    this.soporteState = {};
  }

  async handleIncomingMessage(message, senderInfo) {
    if (message?.type === 'text') {
      const incomingMessage = message.text.body.trim();
      
      // Si el usuario está en modo soporte o asistencia y escribe "salir", se sale de ese modo
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
      
      // Si el usuario está en modo soporte (para cualquier otro mensaje)
      if (this.soporteState[message.from]) {
        const chatResponse = await this.handleChatGPT(incomingMessage);
        await whatsappService.sendMessage(message.from, chatResponse, message.id);
        await whatsappService.markAsRead(message.id);
        return;
      }
      
      // Si el usuario está en modo asistencia (consultar) para soporte
      if (this.assistandState[message.from]) {
        const chatResponse = await this.handleChatGPT(incomingMessage);
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

      // Flujo normal: Saludos y menú
      if (this.isGreeting(incomingMessage.toLowerCase())) {
        await this.sendWelcomeMessage(message.from, message.id, senderInfo);
        await this.sendWelcomeMenu(message.from);
      } else if (incomingMessage.toLowerCase() === 'audio') {
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
        // Activa el modo asistencia/soporte para consultas
        this.assistandState[to] = { step: 'question' };
        response = 'Realiza tu consulta y escribe (salir) para finalizar el soporte';
        await whatsappService.sendMessage(to, response);
        break;
      case 'soporte':
        await this.startSoporte(to);
        break;
      case 'ubicación':
        response = 'Esta es nuestra Ubicación';
        await whatsappService.sendMessage(to, response);
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
    // Inicializa el estado de la cotización para este usuario, guardando el nombre
    this.cotizacionState[to] = {
      stage: 'product',
      product: '',
      quantity: '',
      city: '',
      name
    };
    const messageText = '¡Entendido! Para enviarle una cotización precisa, por favor indíqueme:\n- Tipo de producto (ejemplo: láminas, tubos, vigas)';
    await whatsappService.sendMessage(to, messageText);
  }

  async startSoporte(to) {
    // Activa el modo soporte para el usuario
    this.soporteState[to] = true;
    const welcomeSoporte = "Bienvenido al soporte de Ferraceros. Cuéntame, ¿en qué puedo ayudarte? (Escribe 'salir' para terminar el soporte)";
    await whatsappService.sendMessage(to, welcomeSoporte);
  }

  async handleChatGPT(userMessage) {
    try {
      const response = await openAiService(userMessage);
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
      const nextMessage = '- Cantidad (en unidades, kilos o metros)';
      await whatsappService.sendMessage(to, nextMessage);
    } else if (state.stage === 'quantity') {
      state.quantity = incomingMessage;
      state.stage = 'city';
      const nextMessage = '- Ciudad de entrega (ejemplo: Bogotá, Medellín)';
      await whatsappService.sendMessage(to, nextMessage);
    } else if (state.stage === 'city') {
      state.city = incomingMessage;
      const summary = `Resumen de su cotización:\nProducto: ${state.product}\nCantidad: ${state.quantity}\nCiudad: ${state.city}\nEn un momento se le responderá su cotización.`;
      await whatsappService.sendMessage(to, summary);
      
      // Orden de columnas en la hoja:
      // A: whatsapp, B: nombre, C: tipo, D: cantidad, E: ciudad, F: fecha
      await googleSheetsService([
        to,                           // WhatsApp
        state.name,                   // Nombre
        state.product,                // Tipo
        state.quantity,               // Cantidad
        state.city,                   // Ciudad
        new Date().toLocaleString()   // Fecha
      ]);
      
      console.log(`Cotización guardada para ${to}:`, state);
      delete this.cotizacionState[to];
    }
  }
}

export default new MessageHandler();
