using UnityEngine;
using UnityEngine.Rendering;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace PixelPass.Grass
{
    /// <summary>
    /// Instanced Dylearn-style grass field. Generates blade transforms and draws with GPU instancing.
    /// </summary>
    [ExecuteAlways]
    [DisallowMultipleComponent]
    [AddComponentMenu("Pixel Pass/Grass Field")]
    public class PixelPassGrassField : MonoBehaviour
    {
        private const int MaxInstancesPerBatch = 1023;
        private const float BladeLiftAboveFloor = 0.02f;
        public const string GrassLayerName = "PixelPass Grass";

        [SerializeField] private PixelPassGrassSettings settings;
        [SerializeField] private Material grassMaterial;
        [SerializeField] private Material floorMaterial;
        [SerializeField] private Mesh bladeMesh;
        [SerializeField] private Vector2 fieldSize = new(25f, 25f);
        [SerializeField] private int instanceCount = 30000;
        [SerializeField] private bool regenerateOnEnable = true;

        private Matrix4x4[] m_Matrices = System.Array.Empty<Matrix4x4>();
        private Matrix4x4[] m_BatchMatrices = new Matrix4x4[MaxInstancesPerBatch];
        private MaterialPropertyBlock m_PropertyBlock;
        private readonly Vector4[] m_CharacterScratch = new Vector4[PixelPassGrassCharacterDriver.MaxCharacters];
        private PixelPassGrassSettings m_AppliedSettings;
        private bool m_MaterialsDirty = true;

        public PixelPassGrassSettings Settings => settings;
        public Material GrassMaterial => grassMaterial;
        public Vector2 FieldSize => fieldSize;
        public int InstanceCount => m_Matrices.Length;

        private void Awake()
        {
            m_PropertyBlock = new MaterialPropertyBlock();
            int layer = LayerMask.NameToLayer(GrassLayerName);
            if (layer >= 0)
                gameObject.layer = layer;
        }

        private void OnEnable()
        {
            if (floorMaterial == null && transform.parent != null)
            {
                Transform floorTransform = transform.parent.Find("Grass Floor");
                if (floorTransform != null && floorTransform.TryGetComponent(out MeshRenderer floorRenderer))
                    floorMaterial = floorRenderer.sharedMaterial;
            }

            if (regenerateOnEnable)
                RegenerateInstances();
            else
                SyncFloorToFieldSize();

            MarkMaterialsDirty();
        }

        private void OnDisable()
        {
            m_MaterialsDirty = true;
        }

        public void MarkMaterialsDirty()
        {
            m_MaterialsDirty = true;
        }

        public void RefreshMaterials()
        {
            m_MaterialsDirty = true;
            ApplyMaterialsIfNeeded();
        }

        private void OnValidate()
        {
            fieldSize.x = Mathf.Max(0.1f, fieldSize.x);
            fieldSize.y = Mathf.Max(0.1f, fieldSize.y);
            instanceCount = Mathf.Max(0, instanceCount);
            SyncFloorToFieldSize();
            MarkMaterialsDirty();
        }

        public void RegenerateInstances()
        {
            if (settings == null)
            {
                m_Matrices = System.Array.Empty<Matrix4x4>();
                return;
            }

            SyncFloorToFieldSize();

            int targetCount = instanceCount;
            if (settings.scaleInstanceCountWithArea)
            {
                float area = fieldSize.x * fieldSize.y;
                targetCount = Mathf.RoundToInt(area * settings.densityPerSquareMeter);
            }

            if (settings.maxInstances > 0)
                targetCount = Mathf.Min(targetCount, settings.maxInstances);

            if (settings.visibleInstanceCap > 0)
                targetCount = Mathf.Min(targetCount, settings.visibleInstanceCap);

            targetCount = Mathf.Max(targetCount, 0);
            m_Matrices = new Matrix4x4[targetCount];
            MarkMaterialsDirty();

            Vector3 origin = transform.position;
            Quaternion rotation = transform.rotation;
            Vector3 lossyScale = transform.lossyScale;

            for (int i = 0; i < targetCount; i++)
            {
                float x = Random.Range(-fieldSize.x * 0.5f, fieldSize.x * 0.5f);
                float z = Random.Range(-fieldSize.y * 0.5f, fieldSize.y * 0.5f);
                float scale = settings != null
                    ? Random.Range(settings.instanceScaleMin, settings.instanceScaleMax)
                    : 1f;
                Vector3 local = new Vector3(x, BladeLiftAboveFloor, z);
                Vector3 world = origin + rotation * Vector3.Scale(local, lossyScale);
                Quaternion instanceRotation = rotation;
                if (settings != null && settings.randomYaw)
                {
                    float yaw = Random.Range(0f, 360f);
                    instanceRotation = rotation * Quaternion.Euler(0f, yaw, 0f);
                }

                m_Matrices[i] = Matrix4x4.TRS(world, instanceRotation, Vector3.one * scale);
            }
        }

        /// <summary>
        /// Keeps the sibling Grass Floor plane aligned with instance coverage (Unity plane is 10×10 m).
        /// </summary>
        public void SyncFloorToFieldSize()
        {
            Transform floorTransform = transform.parent != null
                ? transform.parent.Find("Grass Floor")
                : null;
            if (floorTransform == null)
                return;

            float scaleX = fieldSize.x / 10f;
            float scaleZ = fieldSize.y / 10f;
            Vector3 targetScale = new Vector3(scaleX, 1f, scaleZ);
            if (floorTransform.localScale != targetScale)
                floorTransform.localScale = targetScale;
        }

        public void SetCharacterPositions(Vector4[] positions, int count)
        {
            if (m_PropertyBlock == null)
                m_PropertyBlock = new MaterialPropertyBlock();

            int copyCount = Mathf.Min(count, PixelPassGrassCharacterDriver.MaxCharacters);
            for (int i = 0; i < PixelPassGrassCharacterDriver.MaxCharacters; i++)
                m_CharacterScratch[i] = i < copyCount ? positions[i] : Vector4.zero;

            m_PropertyBlock.SetInt("_CharacterCount", copyCount);
            m_PropertyBlock.SetVectorArray("_CharacterPositions", m_CharacterScratch);
        }

        public static void ApplyGrassLayer(GameObject root = null)
        {
            int layer = LayerMask.NameToLayer(GrassLayerName);
            if (layer < 0)
                return;

            if (root != null)
                SetLayerRecursive(root, layer);
        }

        private static void SetLayerRecursive(GameObject obj, int layer)
        {
            obj.layer = layer;
            for (int i = 0; i < obj.transform.childCount; i++)
                SetLayerRecursive(obj.transform.GetChild(i).gameObject, layer);
        }

        public static Mesh CreateBladeMesh(Vector2 size)
        {
            float halfWidth = size.x * 0.5f;
            var mesh = new Mesh { name = "PixelPassGrassBlade" };
            mesh.vertices = new[]
            {
                new Vector3(-halfWidth, 0f, 0f),
                new Vector3(halfWidth, 0f, 0f),
                new Vector3(-halfWidth, size.y, 0f),
                new Vector3(halfWidth, size.y, 0f)
            };
            mesh.uv = new[]
            {
                new Vector2(0f, 0f),
                new Vector2(1f, 0f),
                new Vector2(0f, 1f),
                new Vector2(1f, 1f)
            };
            mesh.triangles = new[] { 0, 2, 1, 2, 3, 1 };
            mesh.RecalculateBounds();
            mesh.RecalculateNormals();
            return mesh;
        }

        private void LateUpdate()
        {
            DrawInstances();
        }

        private void ApplyMaterialsIfNeeded()
        {
            if (!m_MaterialsDirty)
                return;

            if (settings != null)
            {
                if (grassMaterial != null)
                    settings.ApplyGrass(grassMaterial);

                if (floorMaterial != null)
                    settings.ApplyFloor(floorMaterial);
            }

            m_AppliedSettings = settings;
            m_MaterialsDirty = false;
        }

        private void DrawInstances()
        {
            if (!isActiveAndEnabled || grassMaterial == null || bladeMesh == null || m_Matrices.Length == 0)
                return;

            if (settings != m_AppliedSettings)
                MarkMaterialsDirty();

            ApplyMaterialsIfNeeded();

            grassMaterial.enableInstancing = true;

#if UNITY_EDITOR
            if (!Application.isPlaying)
                m_PropertyBlock.SetFloat("_GrassShaderTime", (float)EditorApplication.timeSinceStartup);
            else
#endif
                m_PropertyBlock.SetFloat("_GrassShaderTime", 0f);

            int offset = 0;
            while (offset < m_Matrices.Length)
            {
                int batchCount = Mathf.Min(MaxInstancesPerBatch, m_Matrices.Length - offset);
                System.Array.Copy(m_Matrices, offset, m_BatchMatrices, 0, batchCount);
                Graphics.DrawMeshInstanced(
                    bladeMesh,
                    0,
                    grassMaterial,
                    m_BatchMatrices,
                    batchCount,
                    m_PropertyBlock,
                    ShadowCastingMode.Off,
                    false,
                    gameObject.layer);
                offset += batchCount;
            }
        }
    }
}
