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
      const lowerMsg = incomingMessage.toLowerCase();

      // Mensaje de despedida unificado
      const despedida = "Gracias por contactar a Ferraceros, en un momento te comunicaremos con un asesor.\nSi necesita algo más, no dude en escribirnos.\nTe invitamos a conocer nuestro grupo de empresas.\nFerbienes https://ferbienes.co/\nFlexilogistica https://flexilogistica.com/\nTodos Compramos https://www.todoscompramos.com.co/\nCatalan https://catalan.com.co/blogs/menu\nFerraceros https://ferraceros.com.co";

      // Si el usuario escribe "salir", finaliza el chat y reinicia el historial
      if (lowerMsg === 'salir') {
        delete this.soporteState[message.from];
        delete this.assistandState[message.from];
        delete this.cotizacionState[message.from];
        delete this.conversationHistory[message.from];
        await whatsappService.sendMessage(message.from, despedida, message.id);
        await whatsappService.markAsRead(message.id);
        return;
      }

      // Si es el primer mensaje del usuario, envía saludo y menú inicial
      if (!this.conversationHistory[message.from]) {
        this.conversationHistory[message.from] = [];
        await this.sendWelcomeMessage(message.from, message.id, senderInfo);
        await this.sendWelcomeMenu(message.from);
        await whatsappService.markAsRead(message.id);
        return;
      }

      // Guarda el mensaje en el historial
      this.conversationHistory[message.from].push(`Usuario: ${incomingMessage}`);

      // Modo soporte: redirige a ChatGPT (con historial)
      if (this.soporteState[message.from]) {
        const chatResponse = await this.handleChatGPT(incomingMessage, this.conversationHistory[message.from]);
        this.conversationHistory[message.from].push(`Asistente: ${chatResponse}`);
        await whatsappService.sendMessage(message.from, chatResponse, message.id);
        await whatsappService.markAsRead(message.id);
        return;
      }

      // Modo asistencia (consultar): permite una sola pregunta y luego muestra el menú de consulta
      if (this.assistandState[message.from]) {
        const chatResponse = await this.handleChatGPT(incomingMessage, this.conversationHistory[message.from]);
        this.conversationHistory[message.from].push(`Asistente: ${chatResponse}`);
        await whatsappService.sendMessage(message.from, chatResponse, message.id);
        // Finaliza el modo asistencia y muestra el menú con dos botones ("Cotizar" y "Consultar")
        delete this.assistandState[message.from];
        await this.sendConsultMenu(message.from);
        await whatsappService.markAsRead(message.id);
        return;
      }

      // Flujo de cotización
      if (this.cotizacionState[message.from]) {
        await this.handleCotizacionConversation(message.from, incomingMessage);
        await whatsappService.markAsRead(message.id);
        return;
      }

      // Comandos específicos (multimedia)
      if (lowerMsg === 'audio') {
        await this.sendAudio(message.from);
      } else if (lowerMsg === 'imagen') {
        await this.sendImage(message.from);
      } else if (lowerMsg === 'video') {
        await this.sendVideo(message.from);
      } else if (lowerMsg === 'documento') {
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
    const welcomeMessage = `👋 Hola ${name}, Bienvenido(a) a Ferraceros, su aliado en soluciones de acero para la industria metalmecánica e infraestructura en Colombia💪🇨🇴.\nPuedes escribir "salir" en cualquier momento para finalizar el chat.\n¿En qué puedo ayudarle hoy? Por favor, seleccione una opción:`;
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

  // Menú para consultas: 2 botones (Cotizar y Consultar)
  async sendConsultMenu(to) {
    const menuMessage = "Desea cotizar algún producto o realizar una consulta técnica?";
    const buttons = [
      { type: 'reply', reply: { id: 'option_2', title: 'Cotizar' } },
      { type: 'reply', reply: { id: 'option_3', title: 'Consultar' } }
    ];
    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  // Menú final para flujos (tras una cotización) con 2 botones: "Si" y "No"
  async sendPostQuoteMenu(to) {
    const menuMessage = "¿Desea cotizar algo más?";
    const buttons = [
      { type: 'reply', reply: { id: 'option_si', title: 'Si' } },
      { type: 'reply', reply: { id: 'option_no', title: 'No' } }
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
        await this.sendFinalMenu(to);
        break;
      case 'finalizar chat':
        // Mensaje de despedida unificado
        await whatsappService.sendMessage(
          to,
          "Gracias por contactar a Ferraceros, en un momento te comunicaremos con un asesor.\nSi necesita algo más, no dude en escribirnos. Te invitamos a conocer nuestro grupo de empresas\nFerbienes https://ferbienes.co/\nFlexilogistica https://flexilogistica.com/\nTodos Compramos https://www.todoscompramos.com.co/\nCatalan https://catalan.com.co/blogs/menu\nFerraceros https://ferraceros.com.co",
          null
        );
        delete this.soporteState[to];
        delete this.assistandState[to];
        break;
      // Nuevos casos para el menú post-cotización
      case 'si':
        await this.startCotizacion(to, senderInfo);
        break;
      case 'no':
        await whatsappService.sendMessage(
          to,
          "Gracias por contactar a Ferraceros, en un momento te comunicaremos con un asesor.\nSi necesita algo más, no dude en escribirnos. Te invitamos a conocer nuestro grupo de empresas\nFerbienes https://ferbienes.co/\nFlexilogistica https://flexilogistica.com/\nTodos Compramos https://www.todoscompramos.com.co/\nCatalan https://catalan.com.co/blogs/menu\nFerraceros https://ferraceros.com.co",
          null
        );
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
    // Después de enviar el catálogo, muestra el menú de consulta con dos botones
    await this.sendConsultMenu(to);
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
      unit: '', // Nuevo campo para la unidad
      city: '',
      name
    };
    // Salto de línea agregado después de "productos de acero"
    const messageText = '¡Perfecto! En Ferraceros ofrecemos una amplia gama de productos de acero.\n¿Qué tipo de producto le interesa?\n- Vigas y perfiles estructurales\n- Láminas y placas de acero\n- Canastillas y pasa juntas\n- Acero para refuerzo (varillas, mallas)\n- Ejes y láminas de grado de ingeniería\n- Láminas antidesgaste';
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
      // Agregamos "etc." a la solicitud de ciudad
      const nextMessage = '- Ciudad de entrega (ejemplo: Bogotá, Medellín, etc.)';
      await whatsappService.sendMessage(to, nextMessage);
    } else if (state.stage === 'city') {
      state.city = incomingMessage;
      // Salto de línea después de la ciudad y se actualiza el mensaje resumen
      const summary = `Resumen de su cotización:\nProducto: ${state.product}\nCantidad: ${state.quantity}\nUnidad: ${state.unit}\nCiudad: ${state.city}\nEn unos momentos un asesor se contactará con usted.`;
      await whatsappService.sendMessage(to, summary);
      
      // Guarda la cotización en Google Sheets:
      // A: whatsapp, B: nombre, C: producto, D: cantidad, E: unidad, F: ciudad, G: fecha
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
      // Después de guardar la cotización, muestra el menú post-cotización (2 botones: Si y No)
      await this.sendPostQuoteMenu(to);
    }
  }

  // Menú post-cotización: pregunta si desea cotizar algo más, con botones "Si" y "No"
  async sendPostQuoteMenu(to) {
    const menuMessage = "¿Desea cotizar algo más?";
    const buttons = [
      { type: 'reply', reply: { id: 'option_si', title: 'Si' } },
      { type: 'reply', reply: { id: 'option_no', title: 'No' } }
    ];
    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }
}

export default new MessageHandler();
