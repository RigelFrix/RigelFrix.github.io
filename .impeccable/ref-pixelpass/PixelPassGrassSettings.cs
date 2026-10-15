using UnityEngine;

namespace PixelPass.Grass
{
    /// <summary>
    /// Shared grass look tuned to Dylearn Demo.tscn. Drives grass and optional floor materials.
    /// </summary>
    [CreateAssetMenu(fileName = "PixelPassGrassSettings", menuName = "Pixel Pass/Grass Settings")]
    public class PixelPassGrassSettings : ScriptableObject
    {
        [Header("Sprites")]
        public Texture2D grassLeaf;
        public Texture2D accentLeaf1;
        public Texture2D accentLeaf2;

        [Header("Patch colours")]
        [Tooltip("When off, grass and floor use flat Albedo 1 only; richness comes from sun + cloud lighting.")]
        public bool usePatchColors = true;
        public Color albedo1 = new(0.443f, 0.635f, 0f, 1f);
        public Color albedo2 = new(0.557f, 0.678f, 0.212f, 1f);
        public Color albedo3 = new(0.502f, 0.655f, 0.224f, 1f);
        public Texture2D albedo2Noise;
        public Texture2D albedo3Noise;
        public float albedo2Scale = 0.11f;
        public float albedo2Threshold = 0.537f;
        public float albedo3Scale = 0.1f;
        public float albedo3Threshold = 0.471f;

        [Header("Accents")]
        public Color accentAlbedo1 = new(0.604f, 0.718f, 0f, 1f);
        public Color accentAlbedo2 = new(0.424f, 0.604f, 0f, 1f);
        [Range(0f, 0.05f)] public float accentFrequency1 = 0.001f;
        [Range(0f, 0.05f)] public float accentProbability2 = 0.0001f;
        [Range(0f, 1f)] public float accentHeight1 = 0.1f;
        [Range(0f, 1f)] public float accentHeight2 = 0.185f;
        [Range(0f, 2f)] public float accentScale1 = 1f;
        [Range(0f, 2f)] public float accentScale2 = 1f;

        [Header("Wind")]
        public Texture2D windNoise;
        public float stepFramerate = 5f;
        public bool quantisedFramerate;
        public bool worldSpaceSway = true;
        public bool viewSpaceSway;
        [Range(0f, 180f)] public float worldSwayAngle = 60f;
        [Range(-0.15f, 0.6f)] public float fakePerspectiveScale = 0.3f;
        [Range(-1f, 1f)] public float windNoiseThreshold = 0.365f;
        [Range(0f, 0.1f)] public float windNoiseScale = 0.071f;
        [Range(0f, 0.2f)] public float windNoiseSpeed = 0.025f;
        public Vector2 windDirection = new(0f, 1f);
        [Range(0f, 45f)] public float windDivergeAngle = 10f;
        [Range(0f, 5f)] public float viewSwaySpeed = 0.1f;
        [Range(0f, 45f)] public float viewSwayAngle = 10f;

        [Header("Character displacement")]
        public bool characterDisplacement = true;
        [Range(0f, 360f)] public float displacementAngleZ = 60f;
        [Range(0f, 360f)] public float displacementAngleX = 62.7f;
        [Range(0f, 10f)] public float radiusExponent = 0.9f;

        [Header("Lighting")]
        [Range(1f, 8f)] public float shadeSteps = 3f;
        [Range(-2f, 2f)] public float wrap;
        [Range(1f, 8f)] public float steepness = 1f;
        [Range(0f, 1f)] public float thresholdGradientSize = 0.255f;
        [Range(0f, 1f)] public float alphaCutoff = 0.99f;

        [Header("PixelPass stylize (Holland tuft lighting)")]
        [Tooltip("Sample directional shadow at tuft base so whole blade shares terrain shadow.")]
        public bool shadowAtTuftBase = true;
        [Range(0f, 1f)] public float cloudInfluence = 1f;

        [Header("Field placement")]
        public Vector2 bladeSize = new(0.24f, 0.38f);
        [Range(0.5f, 1.5f)] public float instanceScaleMin = 0.88f;
        [Range(0.5f, 1.5f)] public float instanceScaleMax = 1.12f;
        public bool randomYaw = true;
        [Tooltip("Instances placed per square meter when scaling with area.")]
        public float densityPerSquareMeter = 64f;
        public bool scaleInstanceCountWithArea = true;
        [Tooltip("Hard cap on generated instances.")]
        public int maxInstances = 40000;
        [Tooltip("Optional lower draw cap (Dylearn visible_instance_count = 30000). 0 = draw all.")]
        public int visibleInstanceCap = 30000;

        public void ApplyGrass(Material material)
        {
            if (material == null)
                return;

            SetTexture(material, "_GrassLeafTex", grassLeaf);
            // Dylearn accent 1 reuses the main grassleaf sprite with a different tint/height.
            SetTexture(material, "_AccentLeafTex1", accentLeaf1 != null ? accentLeaf1 : grassLeaf);
            SetTexture(material, "_AccentLeafTex2", accentLeaf2 != null ? accentLeaf2 : grassLeaf);
            SetTexture(material, "_Albedo2Noise", albedo2Noise);
            SetTexture(material, "_Albedo3Noise", albedo3Noise);
            SetTexture(material, "_WindNoise", windNoise);

            material.SetColor("_Albedo1", albedo1);
            material.SetColor("_Albedo2", albedo2);
            material.SetColor("_Albedo3", albedo3);
            material.SetFloat("_Albedo2Scale", albedo2Scale);
            material.SetFloat("_Albedo2Threshold", albedo2Threshold);
            material.SetFloat("_Albedo3Scale", albedo3Scale);
            material.SetFloat("_Albedo3Threshold", albedo3Threshold);
            material.SetFloat("_UsePatchColors", usePatchColors ? 1f : 0f);

            material.SetColor("_AccentAlbedo1", accentAlbedo1);
            material.SetColor("_AccentAlbedo2", accentAlbedo2);
            material.SetFloat("_AccentFrequency1", accentFrequency1);
            material.SetFloat("_AccentProbability2", accentProbability2);
            material.SetFloat("_AccentHeight1", accentHeight1);
            material.SetFloat("_AccentHeight2", accentHeight2);
            material.SetFloat("_AccentScale1", accentScale1);
            material.SetFloat("_AccentScale2", accentScale2);

            material.SetFloat("_GrassFramerate", stepFramerate);
            material.SetFloat("_GrassQuantised", quantisedFramerate ? 1f : 0f);
            material.SetFloat("_WorldSpaceSway", worldSpaceSway ? 1f : 0f);
            material.SetFloat("_ViewSpaceSway", viewSpaceSway ? 1f : 0f);
            material.SetFloat("_WorldSwayAngle", worldSwayAngle);
            material.SetFloat("_FakePerspectiveScale", fakePerspectiveScale);
            material.SetFloat("_WindNoiseThreshold", windNoiseThreshold);
            material.SetFloat("_WindNoiseScale", windNoiseScale);
            material.SetFloat("_WindNoiseSpeed", windNoiseSpeed);
            material.SetVector("_WindDirection", new Vector4(windDirection.x, windDirection.y, 0f, 0f));
            material.SetFloat("_WindDivergeAngle", windDivergeAngle);
            material.SetFloat("_ViewSwaySpeed", viewSwaySpeed);
            material.SetFloat("_ViewSwayAngle", viewSwayAngle);

            material.SetFloat("_CharacterDisplacement", characterDisplacement ? 1f : 0f);
            material.SetFloat("_PlayerDisplacementAngleZ", displacementAngleZ);
            material.SetFloat("_PlayerDisplacementAngleX", displacementAngleX);
            material.SetFloat("_RadiusExponent", radiusExponent);
            material.SetVector("_DisplacementParams", new Vector4(displacementAngleZ, displacementAngleX, radiusExponent, characterDisplacement ? 1f : 0f));

            material.SetFloat("_ShadeSteps", shadeSteps);
            material.SetFloat("_Wrap", wrap);
            material.SetFloat("_Steepness", steepness);
            material.SetFloat("_ThresholdGradientSize", thresholdGradientSize);
            material.SetFloat("_Cutoff", alphaCutoff);
            material.SetFloat("_ShadowAtTuftBase", shadowAtTuftBase ? 1f : 0f);
            material.SetFloat("_SunCloudMix", cloudInfluence);
            material.enableInstancing = true;
        }

        public void ApplyFloor(Material floorMaterial)
        {
            if (floorMaterial == null)
                return;

            SetTexture(floorMaterial, "_Albedo2Noise", albedo2Noise);
            SetTexture(floorMaterial, "_Albedo3Noise", albedo3Noise);
            // Dylearn Floor.gdshader uses the same albedo1/2/3 as grass — no darker floor base.
            floorMaterial.SetColor("_Albedo1", albedo1);
            floorMaterial.SetColor("_Albedo2", albedo2);
            floorMaterial.SetColor("_Albedo3", albedo3);
            floorMaterial.SetFloat("_Albedo2Scale", albedo2Scale);
            floorMaterial.SetFloat("_Albedo2Threshold", albedo2Threshold);
            floorMaterial.SetFloat("_Albedo3Scale", albedo3Scale);
            floorMaterial.SetFloat("_Albedo3Threshold", albedo3Threshold);
            floorMaterial.SetFloat("_ShadeSteps", shadeSteps);
            floorMaterial.SetFloat("_Wrap", wrap);
            floorMaterial.SetFloat("_Steepness", steepness);
            floorMaterial.SetFloat("_ThresholdGradientSize", thresholdGradientSize);
            floorMaterial.SetFloat("_SunCloudMix", cloudInfluence);
            floorMaterial.SetFloat("_ShadowAtTuftBase", shadowAtTuftBase ? 1f : 0f);
            floorMaterial.SetFloat("_UsePatchColors", usePatchColors ? 1f : 0f);
        }

        public void ApplyTo(Material grassMaterial, Material floorMaterial)
        {
            ApplyGrass(grassMaterial);
            ApplyFloor(floorMaterial);
        }

#if UNITY_EDITOR
        private void OnValidate()
        {
            PixelPassGrassField[] fields = Object.FindObjectsByType<PixelPassGrassField>(
                FindObjectsInactive.Include,
                FindObjectsSortMode.None);

            for (int i = 0; i < fields.Length; i++)
            {
                if (fields[i] != null && fields[i].Settings == this)
                    fields[i].RefreshMaterials();
            }
        }
#endif

        private static void SetTexture(Material material, string propertyName, Texture texture)
        {
            if (texture != null && material.HasProperty(propertyName))
                material.SetTexture(propertyName, texture);
        }
    }
}
