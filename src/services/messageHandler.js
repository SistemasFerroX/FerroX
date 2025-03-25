import whatsappService from './whatsappService.js';
import googleSheetsService from './googleSheetsService.js';
import openAiService from './openAiService.js';

class MessageHandler {
  constructor() {
    // Estados para los diferentes flujos de conversación
    this.cotizacionState = {};      // Flujo de cotización
    this.assistandState = {};         // Flujo de asistencia o consultas (modo consulta)
    this.soporteState = {};           // Modo soporte: consulta directa con ChatGPT
    this.conversationHistory = {};    // Historial para dar contexto a ChatGPT

    // Tiempo de inactividad (20 minutos = 20*60*1000 ms)
    this.inactivityTime = 20 * 60 * 1000;
    // Para pruebas, descomente la siguiente línea para usar 10 segundos:
    // this.inactivityTime = 10 * 1000;
    this.inactivityTimeout = {};
  }

  // Reinicia el timer de inactividad para un usuario
  resetInactivityTimer(user) {
    if (this.inactivityTimeout[user]) {
      clearTimeout(this.inactivityTimeout[user]);
    }
    this.inactivityTimeout[user] = setTimeout(() => {
      this.endChatDueToInactivity(user);
    }, this.inactivityTime);
  }

  // Limpia el timer de inactividad para un usuario
  clearInactivityTimer(user) {
    if (this.inactivityTimeout[user]) {
      clearTimeout(this.inactivityTimeout[user]);
      delete this.inactivityTimeout[user];
    }
  }

  // Finaliza el chat por inactividad: envía mensaje de despedida y limpia los estados
  async endChatDueToInactivity(user) {
    const despedida = this.getDespedida();
    await whatsappService.sendMessage(user, despedida, null);
    console.log(`Chat finalizado por inactividad para ${user}`);
    delete this.soporteState[user];
    delete this.assistandState[user];
    delete this.cotizacionState[user];
    delete this.conversationHistory[user];
    this.clearInactivityTimer(user);
  }

  // Retorna el mensaje de despedida formal (con saltos de línea extra entre URLs)
  getDespedida() {
    return "Le agradecemos por haber contactado a Ferraceros. En breve, un asesor se pondrá en contacto con usted.\n\n" +
           "Si requiere información adicional, no dude en comunicarse con nosotros. Le invitamos a conocer nuestro grupo de empresas.\n\n" +
           "Ferbienes:\n\nhttps://ferbienes.co/\n\n" +
           "Flexilogistica:\n\nhttps://flexilogistica.com/\n\n" +
           "Todos Compramos:\n\nhttps://www.todoscompramos.com.co/\n\n" +
           "Catalan:\n\nhttps://catalan.com.co/blogs/menu\n\n" +
           "Ferraceros:\n\nhttps://ferraceros.com.co";
  }

  /**
   * Maneja la entrada de mensajes del usuario.
   */
  async handleIncomingMessage(message, senderInfo) {
    try {
      // 1. Ignorar mensajes del propio bot (para evitar loops).
      const myBotNumber = "15556380968"; // Reemplace con su número en formato E.164 sin "+" (por ejemplo, "15556380968@c.us")
      console.log("Valor real de message.from:", message.from);
      if (message.from.includes(myBotNumber)) {
        console.log("Ignorando mensaje proveniente de mi propio número para evitar loops.");
        return;
      }

      // 2. Procesamiento de mensajes de texto
      if (message?.type === 'text') {
        const incomingMessage = message.text.body.trim();
        const lowerMsg = incomingMessage.toLowerCase();

        // Reinicia el timer de inactividad (excepto si el mensaje es "salir")
        if (lowerMsg !== 'salir') {
          this.resetInactivityTimer(message.from);
        }

        const despedida = this.getDespedida();

        // Comando global: "salir" finaliza la conversación y limpia los estados
        if (lowerMsg === 'salir') {
          console.log(`Finalizando chat para ${message.from}`);
          await whatsappService.sendMessage(message.from, despedida, message.id);
          // Limpia el timer de inactividad para evitar ejecución posterior
          this.clearInactivityTimer(message.from);
          delete this.soporteState[message.from];
          delete this.assistandState[message.from];
          delete this.cotizacionState[message.from];
          delete this.conversationHistory[message.from];
          await whatsappService.markAsRead(message.id);
          return;
        }

        // Si es el primer mensaje del usuario, se envía el saludo y el menú inicial, y se guarda su información en Sheets.
        if (!this.conversationHistory[message.from]) {
          console.log(`Primer mensaje de ${message.from}`);
          this.conversationHistory[message.from] = [];
          await this.sendWelcomeMessage(message.from, message.id, senderInfo);
          await this.sendWelcomeMenu(message.from);
          const initialData = [
            message.from,
            this.getSenderName(senderInfo),
            "", // Columna "satisfacción" vacía
            "", "", "", "", ""
          ];
          await googleSheetsService(initialData);
          await whatsappService.markAsRead(message.id);
          return;
        }

        // Se agrega el mensaje al historial para contexto.
        this.conversationHistory[message.from].push(`Usuario: ${incomingMessage}`);
        console.log(`Mensaje de ${message.from} añadido al historial.`);

        // Flujo: Modo soporte (consulta continua con ChatGPT)
        if (this.soporteState[message.from]) {
          console.log(`Modo soporte activo para ${message.from}`);
          const chatResponse = await this.handleChatGPT(incomingMessage, this.conversationHistory[message.from]);
          this.conversationHistory[message.from].push(`Asistente: ${chatResponse}`);
          await whatsappService.sendMessage(message.from, chatResponse, message.id);
          await whatsappService.markAsRead(message.id);
          return;
        }

        // Flujo: Modo asistencia (consulta única con ChatGPT)
        if (this.assistandState[message.from]) {
          console.log(`Modo asistencia (consulta) para ${message.from}`);
          const chatResponse = await this.handleChatGPT(incomingMessage, this.conversationHistory[message.from]);
          this.conversationHistory[message.from].push(`Asistente: ${chatResponse}`);
          await whatsappService.sendMessage(message.from, chatResponse, message.id);
          delete this.assistandState[message.from];
          await this.sendConsultMenu(message.from);
          await whatsappService.markAsRead(message.id);
          return;
        }

        // Flujo: Cotización
        if (this.cotizacionState[message.from]) {
          console.log(`Modo cotización para ${message.from}`);
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
          // Si no coincide con ningún comando, se responde con un eco formal.
          const response = `Eco: ${message.text.body}`;
          await whatsappService.sendMessage(message.from, response, message.id);
        }
        await whatsappService.markAsRead(message.id);

      // Procesamiento de mensajes interactivos (botones)
      } else if (message?.type === 'interactive') {
        const opcion = message?.interactive?.button_reply?.title?.toLowerCase().trim();
        if (opcion) {
          await this.handleMenuOption(message.from, opcion, senderInfo);
        } else {
          await whatsappService.sendMessage(message.from, "Opción inválida, por favor intente de nuevo.", message.id);
        }
        await whatsappService.markAsRead(message.id);
      }
    } catch (error) {
      console.error("Error en handleIncomingMessage:", error);
    }
  }

  getSenderName(senderInfo) {
    return senderInfo?.profile?.name || senderInfo?.wa_id || "Desconocido";
  }

  async sendWelcomeMessage(to, messageId, senderInfo) {
    const name = this.getSenderName(senderInfo);
    const welcomeMessage =
      `Hola ${name}, le damos la bienvenida a Ferraceros, su socio estratégico en soluciones de acero para la industria metalmecánica e infraestructura en Colombia.\n` +
      `Puede escribir "salir" en cualquier momento para finalizar la conversación.\n` +
      `¿En qué podemos asistirle hoy? Por favor, seleccione una opción:`;
    console.log(`Enviando mensaje de bienvenida a ${to}`);
    await whatsappService.sendMessage(to, welcomeMessage, messageId);
  }

  async sendWelcomeMenu(to) {
    const menuMessage = "Por favor, seleccione una opción:";
    const buttons = [
      { type: 'reply', reply: { id: 'option_1', title: 'Catálogo' } },
      { type: 'reply', reply: { id: 'option_2', title: 'Cotizar' } },
      { type: 'reply', reply: { id: 'option_3', title: 'Consultar' } }
    ];
    console.log(`Enviando menú de bienvenida a ${to}`);
    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  // Menú para consultas: 2 botones (Cotizar y Consultar)
  async sendConsultMenu(to) {
    const menuMessage = "¿Desea solicitar una cotización o realizar una consulta técnica?";
    const buttons = [
      { type: 'reply', reply: { id: 'option_2', title: 'Cotizar' } },
      { type: 'reply', reply: { id: 'option_3', title: 'Consultar' } }
    ];
    console.log(`Enviando menú de consulta a ${to}`);
    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  // Menú post-cotización: 2 botones ("Sí" y "No")
  async sendPostQuoteMenu(to) {
    const menuMessage = "¿Desea solicitar una nueva cotización?";
    const buttons = [
      { type: 'reply', reply: { id: 'option_si', title: 'Sí' } },
      { type: 'reply', reply: { id: 'option_no', title: 'No' } }
    ];
    console.log(`Enviando menú post-cotización a ${to}`);
    await whatsappService.sendInteractiveButtons(to, menuMessage, buttons);
  }

  async handleMenuOption(to, option, senderInfo) {
    let response;
    console.log(`handleMenuOption para ${to} - Opción: ${option}`);
    switch (option) {
      case 'catálogo':
        await this.sendCatalog(to);
        break;
      case 'solicitar una cotización':
      case 'cotizar':
        await this.startCotizacion(to, senderInfo);
        break;
      case 'consultar':
        this.assistandState[to] = { step: 'question' };
        this.conversationHistory[to] = this.conversationHistory[to] || [];
        response = 'Por favor, realice su consulta y escriba "salir" para finalizar el servicio.';
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
        await this.sendWelcomeMenu(to);
        break;
      case 'finalizar chat':
        // Finaliza la conversación directamente
        const despedida = this.getDespedida();
        await whatsappService.sendMessage(to, despedida, null);
        // Limpia el timer de inactividad
        this.clearInactivityTimer(to);
        delete this.soporteState[to];
        delete this.assistandState[to];
        delete this.cotizacionState[to];
        delete this.conversationHistory[to];
        break;
      // Casos para el menú post-cotización
      case 'sí':
        await this.startCotizacion(to, senderInfo);
        break;
      case 'no':
        const despedidaFinal = this.getDespedida();
        await whatsappService.sendMessage(to, despedidaFinal, null);
        // Reinicia todos los estados y limpia el timer
        this.clearInactivityTimer(to);
        delete this.soporteState[to];
        delete this.assistandState[to];
        delete this.cotizacionState[to];
        delete this.conversationHistory[to];
        break;
      default:
        response = 'Lo siento, no entendí su selección. Por favor, elija una de las opciones del menú.';
        await whatsappService.sendMessage(to, response);
    }
  }

  async sendCatalog(to) {
    const catalogUrl = 'https://ferraceros.com.co/wp-content/uploads/2025/03/CatalogoFerraceros21_02_25-comprimido-1.pdf';
    const caption = 'Por favor, consulte nuestro catálogo para obtener información detallada sobre nuestros productos y especificaciones técnicas.';
    const type = 'document';
    console.log(`Enviando catálogo a ${to}`);
    await whatsappService.sendMediaMessage(to, type, catalogUrl, caption);
    // Después de enviar el catálogo, se muestra el menú de consulta
    await this.sendConsultMenu(to);
  }

  async sendAudio(to) {
    const mediaUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
    const caption = 'Este es un archivo de audio.';
    const type = 'audio';
    console.log(`Enviando audio a ${to}`);
    await whatsappService.sendMediaMessage(to, type, mediaUrl, caption);
  }

  async sendImage(to) {
    const mediaUrl = 'https://dummyimage.com/800x600/000/fff.png&text=Acero';
    const caption = 'Este es un archivo de imagen.';
    const type = 'image';
    console.log(`Enviando imagen a ${to}`);
    await whatsappService.sendMediaMessage(to, type, mediaUrl, caption);
  }

  async sendVideo(to) {
    const mediaUrl = 'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4';
    const caption = 'Este es un archivo de video.';
    const type = 'video';
    console.log(`Enviando video a ${to}`);
    await whatsappService.sendMediaMessage(to, type, mediaUrl, caption);
  }

  async sendDocument(to) {
    const mediaUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    const caption = 'Este es un archivo de documento.';
    const type = 'document';
    console.log(`Enviando documento a ${to}`);
    await whatsappService.sendMediaMessage(to, type, mediaUrl, caption);
  }

  async startCotizacion(to, senderInfo) {
    const name = this.getSenderName(senderInfo);
    this.cotizacionState[to] = {
      stage: 'product',
      product: '',
      quantity: '',
      unit: '',
      city: '',
      name
    };
    const messageText =
      'Muy bien. En Ferraceros ofrecemos una amplia gama de productos de acero.\n' +
      'Por favor, seleccione el tipo de producto que le interesa:\n\n' +
      '1. -Vigas y perfiles estructurales\n\n' +
      '2. -Láminas y placas de acero\n\n' +
      '3. -Canastillas Pasajuntas\n\n' +
      '4. -Acero para refuerzo (varillas, mallas)\n\n' +
      '5. -Ejes y láminas de grado de ingeniería\n\n' +
      '6. -Láminas antidesgaste';
    console.log(`Iniciando cotización para ${to}`);
    await whatsappService.sendMessage(to, messageText);
  }

  async startSoporte(to) {
    this.soporteState[to] = true;
    this.conversationHistory[to] = this.conversationHistory[to] || [];
    const welcomeSoporte = "Bienvenido al servicio de soporte de Ferraceros. Por favor, indíquenos en qué podemos asistirle. (Escriba 'salir' para finalizar el servicio)";
    console.log(`Iniciando soporte para ${to}`);
    await whatsappService.sendMessage(to, welcomeSoporte);
  }

  async handleChatGPT(userMessage, history = []) {
    try {
      const contexto = history.join('\n');
      const prompt = `Contexto previo:\n${contexto}\nPregunta: ${userMessage}`;
      console.log("Enviando prompt a ChatGPT:", prompt);
      const response = await openAiService(prompt);
      return response || "Lo siento, no tengo respuesta en este momento.";
    } catch (error) {
      console.error("Error en handleChatGPT:", error);
      return "Lo siento, hubo un error procesando su solicitud.";
    }
  }

  async handleCotizacionConversation(to, incomingMessage) {
    const state = this.cotizacionState[to];
    if (!state) return;

    console.log(`Estado actual para ${to}:`, state);
    console.log(`Mensaje recibido: "${incomingMessage}"`);

    if (state.stage === 'product') {
      // Se espera un número para seleccionar el producto
      const productOptions = {
        "1": "Vigas y perfiles estructurales",
        "2": "Láminas y placas de acero",
        "3": "Canastillas Pasajuntas",
        "4": "Acero para refuerzo (varillas, mallas)",
        "5": "Ejes y láminas de grado de ingeniería",
        "6": "Láminas antidesgaste"
      };
      state.product = productOptions[incomingMessage] || incomingMessage;
      state.stage = 'quantity';
      const nextMessage = '- Por favor, indique la cantidad (ejemplo: 800)';
      await whatsappService.sendMessage(to, nextMessage);
    } else if (state.stage === 'quantity') {
      state.quantity = incomingMessage;
      state.stage = 'unit';
      const nextMessage = '- Por favor, indique la unidad (ejemplo: kilos, unidades, etc.)';
      await whatsappService.sendMessage(to, nextMessage);
    } else if (state.stage === 'unit') {
      state.unit = incomingMessage;
      state.stage = 'city';
      const nextMessage = '- Por favor, indique la ciudad de entrega (ejemplo: Bogotá, Medellín, etc.)';
      await whatsappService.sendMessage(to, nextMessage);
    } else if (state.stage === 'city') {
      state.city = incomingMessage;
      const summary =
        `Resumen de su cotización:\n` +
        `Producto: ${state.product}\n\n` +
        `Cantidad: ${state.quantity}\n\n` +
        `Unidad: ${state.unit}\n\n` +
        `Ciudad: ${state.city}\n\n` +
        `En breve, un asesor se pondrá en contacto con usted.`;
      await whatsappService.sendMessage(to, summary);
      
      // Guarda la cotización en Google Sheets (Columnas: Número, Nombre, Producto, Cantidad, Unidad, Ciudad, Fecha)
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
      // Después de guardar la cotización, se muestra el menú post-cotización (2 botones: "Sí" y "No")
      await this.sendPostQuoteMenu(to);
    }
  }

  // En este ejemplo, se finaliza el chat directamente sin solicitar retroalimentación.
  async handleFeedback(to, feedback, senderInfo) {
    const despedidaFinal = this.getDespedida();
    await whatsappService.sendMessage(to, despedidaFinal, null);
    delete this.soporteState[to];
    delete this.assistandState[to];
    delete this.cotizacionState[to];
    delete this.conversationHistory[to];
  }
}

export default new MessageHandler();
