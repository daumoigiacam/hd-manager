package com.hdmanager.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.security.keystore.KeyProperties;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import ee.forgr.biometric.BiometricAuthenticatorConfig;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class BiometricConfigurationTest {
    @Test
    public void protectedStorageDefaultsToStrongBiometricOnly() {
        BiometricAuthenticatorConfig config = BiometricAuthenticatorConfig.fromAllowedTypes(null);
        assertEquals(15, config.promptAuthenticators);
        assertEquals(KeyProperties.AUTH_BIOMETRIC_STRONG, config.keyAuthTypes);
        assertTrue(config.requiresCryptoObject);
        assertTrue(config.allowNegativeButton);
    }

    @Test
    public void allBiometricSelectionsUsePlatformKeystoreConstants() {
        for (int type : new int[] { 3, 4, 5, 6 }) {
            BiometricAuthenticatorConfig config = BiometricAuthenticatorConfig.fromAllowedTypes(new int[] { type });
            assertEquals(15, config.promptAuthenticators);
            assertEquals(KeyProperties.AUTH_BIOMETRIC_STRONG, config.keyAuthTypes);
        }
        assertEquals(KeyProperties.AUTH_DEVICE_CREDENTIAL,
            BiometricAuthenticatorConfig.fromAllowedTypes(new int[] { 7 }).keyAuthTypes);
    }
}
