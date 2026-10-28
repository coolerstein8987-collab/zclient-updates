package de.zclient.zknifehand.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import de.zclient.zknifehand.KnifeHand;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Zeichnet beim Z Butterfly-Messer in der Ego-Sicht den echten Spieler-Arm mit dem Messer in der Hand. */
@Mixin(ItemInHandRenderer.class)
public abstract class ItemInHandRendererMixin {
	@Shadow
	@Final
	private EntityRenderDispatcher entityRenderDispatcher;

	@Inject(method = "renderArmWithItem", at = @At("HEAD"), cancellable = true)
	private void zknife$renderArmWithKnife(AbstractClientPlayer player, float partialTick, float pitch, InteractionHand hand,
			float swingProgress, ItemStack stack, float equippedProgress, PoseStack poseStack, SubmitNodeCollector collector,
			int light, CallbackInfo ci) {
		if (KnifeHand.render((ItemInHandRenderer) (Object) this, this.entityRenderDispatcher, player, partialTick, hand,
				swingProgress, stack, equippedProgress, poseStack, collector, light)) {
			ci.cancel();
		}
	}
}
