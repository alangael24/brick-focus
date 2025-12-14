import NfcManager, { NfcTech } from 'react-native-nfc-manager';

class NfcService {
  async init() {
    try {
      const supported = await NfcManager.isSupported();
      if (supported) {
        await NfcManager.start();
      }
      return supported;
    } catch (error) {
      console.log('Error inicializando NFC:', error);
      return false;
    }
  }

  async isEnabled() {
    try {
      return await NfcManager.isEnabled();
    } catch (error) {
      return false;
    }
  }

  async readTag() {
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      return {
        success: true,
        tagId: tag?.id || null,
        techTypes: tag?.techTypes || [],
      };
    } catch (error) {
      console.log('Error leyendo NFC:', error);
      return { success: false, error: error.message };
    } finally {
      await this.cancelRequest();
    }
  }

  async cancelRequest() {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch (error) {
      // Ignorar errores de cancelación
    }
  }

  async cleanup() {
    await this.cancelRequest();
  }
}

export const nfcService = new NfcService();
