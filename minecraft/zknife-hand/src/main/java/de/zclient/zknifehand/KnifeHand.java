package de.zclient.zknifehand;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import java.util.Set;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.player.PlayerModelPart;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * Ego-Sicht mit dem Z Butterfly-Messer: der echte Arm (mit Skin) hält das Messer wie in der 3. Person.
 * Die Messer-Animation (Inspect, Flips, Leuchtspur) kommt aus dem Ressourcenpaket; hier bewegt sich
 * beim Inspect zusätzlich der Arm. Die Zahlen stammen aus minecraft/butterfly-messer/tools/build.py
 * (MOD_BASE_TRANSLATION, MOD_BASE_ROTATION, MOD_INSPECT_KEYS) und müssen dazu passen.
 */
public final class KnifeHand {
	private static final float DEG = Mth.DEG_TO_RAD;

	/** Grundhaltung des Arms (Blöcke, Grad in XYZ-Reihenfolge). */
	private static final float BASE_X = 0.2352F, BASE_Y = -0.1241F, BASE_Z = 0.3796F;
	private static final float ROT_X = 90.979F, ROT_Y = -32.204F, ROT_Z = 122.026F;

	/** Inspect: Tick, Drehung um die Armachse (Grad), Anheben x/y/z (Blöcke). */
	private static final float[][] INSPECT = {
		{0, 0, 0, 0, 0},
		{7, -35, -0.10F, 0.12F, 0},
		{12, -30, -0.09F, 0.14F, 0},
		{28, -32, -0.10F, 0.13F, 0},
		{44, -24, -0.08F, 0.11F, 0},
		{48, -34, -0.10F, 0.13F, 0},
		{60, -28, -0.09F, 0.12F, 0},
		{65, 0, 0, 0, 0},
	};
	private static final float[] REST = {0, 0, 0, 0};

	/** Namen, mit denen ein umbenanntes Schwert zum Messer wird (wie im Ressourcenpaket). */
	private static final Set<String> NAMES = Set.of(
		"Butterfly", "butterfly", "Butterfly Knife", "Butterfly Messer", "Butterfly-Messer", "Balisong", "Butterfly Neon",
		"Butterfly Rot", "Butterfly rot", "Butterfly Red", "Butterfly Gold", "Butterfly gold", "Butterfly Gelb",
		"Butterfly Blau", "Butterfly blau", "Butterfly Blue");
	private static final Identifier PACK_PROBE = Identifier.fromNamespaceAndPath("zknife", "items/butterfly_neon.json");

	private static long packCheckedAt;
	private static boolean packActive;

	private KnifeHand() {
	}

	/** Ist das ein Z Butterfly-Messer (per Befehl/Rezept oder umbenanntes Schwert bei aktivem Paket)? */
	public static boolean isKnife(ItemStack stack) {
		if (stack.isEmpty()) {
			return false;
		}
		Identifier model = stack.get(DataComponents.ITEM_MODEL);
		if (model != null && model.getNamespace().equals("zknife")) {
			return true;
		}
		Component name = stack.get(DataComponents.CUSTOM_NAME);
		if (name == null || !NAMES.contains(name.getString())) {
			return false;
		}
		return BuiltInRegistries.ITEM.getKey(stack.getItem()).getPath().endsWith("_sword") && packActive();
	}

	private static boolean packActive() {
		long now = System.currentTimeMillis();
		if (now - packCheckedAt > 3000) {
			packCheckedAt = now;
			packActive = Minecraft.getInstance().getResourceManager().getResource(PACK_PROBE).isPresent();
		}
		return packActive;
	}

	/** Zeichnet Arm + Messer. Gibt false zurück, wenn Minecraft wie gewohnt weitermachen soll. */
	public static boolean render(ItemInHandRenderer itemRenderer, EntityRenderDispatcher dispatcher, AbstractClientPlayer player,
			float partialTick, InteractionHand hand, float swingProgress, ItemStack stack, float equippedProgress,
			PoseStack poseStack, SubmitNodeCollector collector, int light) {
		if (player.isInvisible() || !isKnife(stack)) {
			return false;
		}
		HumanoidArm arm = hand == InteractionHand.MAIN_HAND ? player.getMainArm() : player.getMainArm().getOpposite();
		boolean right = arm == HumanoidArm.RIGHT;
		float side = right ? 1.0F : -1.0F;
		float[] inspect = inspectPose(player, hand, partialTick);

		poseStack.pushPose();
		// Schlag- und Ausrüst-Bewegung wie bei normalen Gegenständen
		float swingRoot = Mth.sqrt(swingProgress);
		poseStack.translate(side * -0.4F * Mth.sin(swingRoot * Mth.PI), 0.2F * Mth.sin(swingRoot * Mth.TWO_PI),
				-0.2F * Mth.sin(swingProgress * Mth.PI));
		poseStack.translate(side * (0.56F + inspect[1]), -0.52F + equippedProgress * -0.6F + inspect[2], -0.72F + inspect[3]);
		float swingSq = Mth.sin(swingProgress * swingProgress * Mth.PI);
		poseStack.mulPose(Axis.YP.rotationDegrees(side * (45.0F + swingSq * -20.0F)));
		float swingArc = Mth.sin(swingRoot * Mth.PI);
		poseStack.mulPose(Axis.ZP.rotationDegrees(side * swingArc * -20.0F));
		poseStack.mulPose(Axis.XP.rotationDegrees(swingArc * -80.0F));
		poseStack.mulPose(Axis.YP.rotationDegrees(side * -45.0F));

		// Grundhaltung des Arms (für die linke Hand gespiegelt)
		poseStack.translate(side * BASE_X, BASE_Y, BASE_Z);
		poseStack.mulPose(new Quaternionf().rotationXYZ(ROT_X * DEG, side * ROT_Y * DEG, side * ROT_Z * DEG));

		AvatarRenderer<AbstractClientPlayer> renderer = dispatcher.getPlayerRenderer(player);
		PlayerModel model = renderer.getModel();
		ModelPart armPart = right ? model.rightArm : model.leftArm;

		// Inspect: Arm um die eigene Achse drehen (Drehpunkt = Schulter-Gelenk des Arm-Modells)
		if (inspect[0] != 0.0F) {
			PartPose pivot = armPart.getInitialPose();
			poseStack.translate(pivot.x() / 16.0F, pivot.y() / 16.0F, pivot.z() / 16.0F);
			Vector3f axis = new Vector3f(-side * Mth.sin(0.1F), Mth.cos(0.1F), 0.0F);
			poseStack.mulPose(new Quaternionf().rotationAxis(side * inspect[0] * DEG, axis));
			poseStack.translate(-pivot.x() / 16.0F, -pivot.y() / 16.0F, -pivot.z() / 16.0F);
		}

		Identifier skin = player.getSkin().body().texturePath();
		if (right) {
			renderer.renderRightHand(poseStack, collector, light, skin, player.isModelPartShown(PlayerModelPart.RIGHT_SLEEVE));
		} else {
			renderer.renderLeftHand(poseStack, collector, light, skin, player.isModelPartShown(PlayerModelPart.LEFT_SLEEVE));
		}

		// Messer in die Faust – wie Minecraft es in der 3. Person macht
		armPart.translateAndRotate(poseStack);
		poseStack.mulPose(Axis.XP.rotationDegrees(-90.0F));
		poseStack.mulPose(Axis.YP.rotationDegrees(180.0F));
		poseStack.translate(side / 16.0F, 0.125F, -0.625F);
		itemRenderer.renderItem(player, stack, right ? ItemDisplayContext.THIRD_PERSON_RIGHT_HAND : ItemDisplayContext.THIRD_PERSON_LEFT_HAND,
				poseStack, collector, light);
		poseStack.popPose();
		return true;
	}

	/** Drehung (Grad) und Anheben (x, y, z) während des Inspects; sonst Ruhe. */
	private static float[] inspectPose(AbstractClientPlayer player, InteractionHand hand, float partialTick) {
		if (!player.isUsingItem() || player.getUsedItemHand() != hand || Minecraft.getInstance().options.keyShift.isDown()) {
			return REST;
		}
		float t = player.getTicksUsingItem() + partialTick;
		for (int i = 0; i + 1 < INSPECT.length; i++) {
			float[] a = INSPECT[i];
			float[] b = INSPECT[i + 1];
			if (t >= a[0] && t <= b[0]) {
				float k = (t - a[0]) / (b[0] - a[0]);
				k = k * k * (3.0F - 2.0F * k);
				return new float[] {
					Mth.lerp(k, a[1], b[1]), Mth.lerp(k, a[2], b[2]), Mth.lerp(k, a[3], b[3]), Mth.lerp(k, a[4], b[4])};
			}
		}
		return REST;
	}
}
