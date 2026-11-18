const { GoogleGenAI } = require('@google/genai');

const prompt = 'Analiza esta imagen y determina únicamente si corresponde visualmente a un comprobante de transferencia bancaria, recibo de pago digital (como Nequi, Daviplata, Bancolombia o similar) o factura. No valides montos, fechas ni remitentes. Responde estrictamente con un JSON: {"isValid": true} si parece un comprobante, o {"isValid": false} si es cualquier otra cosa (selfie, meme, paisaje, objeto, etc.).';

const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];

const validateReceipt = async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('La variable GEMINI_API_KEY no está configurada');
        }

        const ai = new GoogleGenAI({});
        const { image, imageBase64, mimeType: requestedMimeType } = req.body || {};
        const imageInput = image || imageBase64;

        if (typeof imageInput !== 'string' || !imageInput) {
            return res.status(400).json({ valid: false, message: 'Se requiere una imagen en base64' });
        }

        const dataUrlMatch = imageInput.match(/^data:(image\/[^;]+);base64,(.+)$/);
        const base64 = dataUrlMatch ? dataUrlMatch[2] : imageInput;
        const mimeType = requestedMimeType || (dataUrlMatch && dataUrlMatch[1]);

        if (
            typeof mimeType !== 'string' ||
            !mimeType.startsWith('image/') ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
            base64.length === 0 ||
            base64.length % 4 === 1
        ) {
            return res.status(400).json({
                valid: false,
                message: 'La imagen o su mimeType no son válidos'
            });
        }

        let response;
        let lastError;

        for (const model of MODELS) {
            try {
                response = await ai.models.generateContent({
                    model,
                    contents: [
                        { inlineData: { data: base64, mimeType } },
                        { text: prompt }
                    ],
                    config: { responseMimeType: 'application/json' }
                });
                break;
            } catch (err) {
                lastError = err;
                const status = Number(err.status || err.statusCode);
                if ([503, 429, 404].includes(status)) {
                    continue;
                }
                throw err;
            }
        }

        if (!response) {
            throw lastError || new Error('No se recibió una respuesta de Gemini');
        }

        const result = JSON.parse(response.text);

        if (typeof result.isValid !== 'boolean') {
            throw new Error('Gemini devolvió una respuesta sin el campo isValid booleano');
        }

        if (result.isValid) {
            return res.status(200).json({
                valid: true,
                isValid: true,
                message: 'Comprobante validado'
            });
        }

        return res.status(400).json({
            valid: false,
            isValid: false,
            message: 'Pago no exitoso / Comprobante inválido'
        });
    } catch (error) {
        console.error('Error al validar el comprobante:', error);
        return res.status(500).json({
            valid: false,
            message: 'Error técnico al validar el comprobante'
        });
    }
};

module.exports = { validateReceipt };