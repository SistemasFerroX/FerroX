import whatsappService from './whatsappService.js';

class MessageHandler {
  constructor() {
    // Objeto para almacenar el estado de la conversación de cotización por usuario
    this.cotizacionState = {};
  }

  async handleIncomingMessage(message, senderInfo) {
    // Si el mensaje es de tipo texto
    if (message?.type === 'text') {
      const incomingMessage = message.text.body.toLowerCase().trim();
      
      // Si ya existe una conversación de cotización para este usuario, la gestionamos
      if (this.cotizacionState[message.from]) {
        await this.handleCotizacionConversation(message.from, incomingMessage);
        await whatsappService.markAsRead(message.id);
        return; // Salir para no procesar el mensaje de otra forma
      }

      if (this.isGreeting(incomingMessage)) {
        await this.sendWelcomeMessage(message.from, message.id, senderInfo);
        await this.sendWelcomeMenu(message.from);
      } else if (incomingMessage === 'audio') {
        await this.sendAudio(message.from);
      } else if (incomingMessage === 'imagen') {
        await this.sendImage(message.from);
      } else if (incomingMessage === 'video') {
        await this.sendVideo(message.from);
      } else if (incomingMessage === 'documento') {
        await this.sendDocument(message.from);
      } else {
        const response = `Echo: ${message.text.body}`;
        await whatsappService.sendMessage(message.from, response, message.id);
      }
      await whatsappService.markAsRead(message.id);
    } else if (message?.type === 'interactive') {
      const opcion = message?.interactive?.button_reply?.title?.toLowerCase().trim();
      if (opcion) {
        await this.handleMenuOption(message.from, opcion);
      } else {
        await whatsappService.sendMessage(message.from, "Opción inválida, intenta de nuevo.");
      }
      await whatsappService.markAsRead(message.id);
    }
  }

  isGreeting(message) {
    const greetings = ["hola", "hello", "hi", "buenas tardes"];
    return greetings.includes(message);
  }

  getSenderName(senderInfo) {
    return senderInfo.profile?.name || senderInfo.wa_id || "Hola amig@";
  }

  async sendWelcomeMessage(to, messageId, senderInfo) {
    const name = this.getSenderName(senderInfo);
    const welcomeMessage = `👋 Hola ${name}, Bienvenido(a) a Ferraceros, su aliado en soluciones de acero para la industria metalmecánica e infraestructura en Colombia💪🇨🇴. ¿En qué puedo ayudarle hoy? Por favor, seleccione una opción:`;
    await whatsappService.sendMessage(to, welcomeMessage, messageId);
  }

  async sendWelcomeMenu(to) {
    const menuMessage = "Elige una opción";
    const buttons = [
      { type: 'reply', reply: { id: 'option_1', title: 'Servicios' } },
      { type: 'reply', reply: { id: 'option_2', title: 'Cotizar' } }, // Acortado
      { type: 'reply', reply: { id: 'option_3', title: 'Ubicación' } }
    ];
    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  async handleMenuOption(to, option) {
    let response;
    switch (option) {
      case 'servicios':
        // Enviar el catálogo (documento) con el mensaje deseado
        await this.sendCatalog(to);
        break;
      case 'solicitar una cotización':
      case 'cotizar': // en caso de que el usuario escriba "cotizar"
        await this.startCotizacion(to);
        break;
      case 'consultar':
        response = 'Realiza tu consulta';
        await whatsappService.sendMessage(to, response);
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
    // Reemplaza la URL por la dirección pública de tu catálogo PDF
    const catalogUrl = 'https://tudominio.com/catalogo.pdf';
    const caption = 'Explora nuestro catálogo para conocer otros productos y/o especificaciones técnicas';
    const type = 'document';
    await whatsappService.sendMediaMessage(to, type, catalogUrl, caption);
  }

  // Métodos para enviar otros tipos de medios
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

  // Inicia la conversación de cotización
  async startCotizacion(to) {
    // Se inicializa el estado de cotización para este usuario
    this.cotizacionState[to] = {
      stage: 'product',
      product: '',
      quantity: '',
      city: ''
    };
    const messageText = '¡Entendido! Para enviarle una cotización precisa, por favor indíqueme:\n- Tipo de producto (ejemplo: láminas, tubos, vigas)';
    await whatsappService.sendMessage(to, messageText);
  }

  // Maneja la conversación de cotización paso a paso
  async handleCotizacionConversation(to, incomingMessage) {
    const state = this.cotizacionState[to];
    if (!state) return;

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
      // Se envía el resumen de la cotización
      const summary = `Resumen de su cotización:\nProducto: ${state.product}\nCantidad: ${state.quantity}\nCiudad: ${state.city}\nEn un momento se le responderá su cotización.`;
      await whatsappService.sendMessage(to, summary);
      // Se elimina el estado de cotización para este usuario
      delete this.cotizacionState[to];
    }
  }
}

export default new MessageHandler();
