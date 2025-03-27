import axios from "axios";
import config from "../../config/env.js";

const sendToWhatsApp = async (data) => {
  const baseUrl = `${config.BASE_URL}/${config.API_VERSION}/${config.BUSINESS_PHONE}/messages`;
  
  const headers = {
    Authorization: `Bearer ${config.API_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    const response = await axios({
      method: "POST",
      url: baseUrl,
      headers,
      data,
    });
    return response.data;   // ojo aquí, no 'datal'
  } catch (error) {
    console.error("Error en sendToWhatsApp:", error);
    // Podrías lanzar el error, o retornar un objeto de error
    throw error;
  }
};

export default sendToWhatsApp;
