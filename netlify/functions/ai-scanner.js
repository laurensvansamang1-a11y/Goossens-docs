const { GoogleGenerativeAI } = require("@google/generative-ai");

// Functie om even te wachten (pauze) tussen pogingen
const wait = (ms) => new Promise(res => setTimeout(res, ms));

exports.handler = async (event) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);
  const maxRetries = 3; // We proberen het maximaal 3 keer

  for (let i = 0; i < maxRetries; i++) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: "v1" });
      const { promptText, mimeType, base64Data } = JSON.parse(event.body);

      let result;
      if (base64Data && mimeType) {
        result = await model.generateContent([
          promptText,
          { inlineData: { data: base64Data, mimeType } }
        ]);
      } else {
        result = await model.generateContent(promptText);
      }

      const response = await result.response;
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ result: response.text() }),
      };

    } catch (error) {
      // Als het een 503 fout is (druk bij Google), wacht dan even en probeer opnieuw
      if (error.message.includes("503") || error.message.includes("high demand")) {
        console.log(`Poging ${i + 1} mislukt door drukte, even wachten...`);
        await wait(2000 * (i + 1)); // Wacht steeds iets langer (2s, 4s, 6s)
        continue; // Ga naar de volgende poging in de loop
      }
      
      // Bij andere fouten (zoals 400 of 404) stoppen we direct
      return {
        statusCode: 500,
        body: JSON.stringify({ error: `Diagnose: ${error.message}` }),
      };
    }
  }

  return {
    statusCode: 503,
    body: JSON.stringify({ error: "Google heeft het momenteel te druk. Probeer het over een minuutje nog eens." }),
  };
};
