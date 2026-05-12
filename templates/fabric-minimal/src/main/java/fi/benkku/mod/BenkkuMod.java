package fi.benkku.mod;

import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class BenkkuMod implements ModInitializer {
	public static final String MOD_ID = "benkku_template";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	@Override
	public void onInitialize() {
		LOGGER.info("Benkku mod '{}' initialized.", MOD_ID);
	}
}
