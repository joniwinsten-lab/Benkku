package fi.benkku.mod;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.CreativeModeTabs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class BenkkuMod implements ModInitializer {
	public static final String MOD_ID = "benkku_template";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	@Override
	public void onInitialize() {
		LOGGER.info("Benkku mod '{}' initialized.", MOD_ID);
		ModFeatures.register();
		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.INGREDIENTS).register(entries -> {
			for (var key : BuiltInRegistries.ITEM.registryKeySet()) {
				if (!key.identifier().getNamespace().equals(MOD_ID)) {
					continue;
				}
				BuiltInRegistries.ITEM.get(key).ifPresent(ref -> entries.accept(ref.value()));
			}
		});
	}
}
