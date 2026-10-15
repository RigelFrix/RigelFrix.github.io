Shader "PixelPass/Grass Floor"
{
    Properties
    {
        [MainColor] _Albedo1("Albedo 1", Color) = (0.443, 0.635, 0, 1)
        _Albedo2("Albedo 2", Color) = (0.557, 0.678, 0.212, 1)
        _Albedo2Scale("Albedo 2 Scale", Float) = 0.11
        _Albedo2Threshold("Albedo 2 Threshold", Range(0, 1)) = 0.537
        _Albedo2Noise("Albedo 2 Noise", 2D) = "gray" {}
        _Albedo3("Albedo 3", Color) = (0.502, 0.655, 0.224, 1)
        _Albedo3Scale("Albedo 3 Scale", Float) = 0.1
        _Albedo3Threshold("Albedo 3 Threshold", Range(0, 1)) = 0.471
        _Albedo3Noise("Albedo 3 Noise", 2D) = "gray" {}
        _ShadeSteps("Shade Steps", Range(1, 8)) = 3
        _Wrap("Wrap", Range(-2, 2)) = 0
        _Steepness("Steepness", Range(1, 8)) = 1
        _ThresholdGradientSize("Hybrid Gradient Size", Range(0, 1)) = 0.15
        _SunCloudMix("Cloud Influence", Range(0, 1)) = 1
        [Toggle] _ShadowAtTuftBase("Shadow At Tuft Base", Float) = 1
        [Toggle] _UsePatchColors("Use Patch Colours", Float) = 0
    }

    SubShader
    {
        Tags
        {
            "RenderType" = "Opaque"
            "Queue" = "Geometry"
            "RenderPipeline" = "UniversalPipeline"
        }

        Pass
        {
            Name "GrassFloorForward"
            Tags { "LightMode" = "UniversalForward" }

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "../../ShaderLibrary/PixelPassBanding.hlsl"
            #include "../../World/ShaderLibrary/PixelPassWorldClouds.hlsl"
            #include "../ShaderLibrary/PixelPassGrassStylize.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _Albedo1;
                float4 _Albedo2;
                float4 _Albedo3;
                float _Albedo2Scale;
                float _Albedo2Threshold;
                float _Albedo3Scale;
                float _Albedo3Threshold;
                float _ShadeSteps;
                float _Wrap;
                float _Steepness;
                float _ThresholdGradientSize;
                float _SunCloudMix;
                float _ShadowAtTuftBase;
                float _UsePatchColors;
            CBUFFER_END

            TEXTURE2D(_Albedo2Noise);
            SAMPLER(sampler_Albedo2Noise);
            TEXTURE2D(_Albedo3Noise);
            SAMPLER(sampler_Albedo3Noise);

            #include "../../World/ShaderLibrary/PixelPassWorldPatch.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 normalWS : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
            };

            Varyings Vert(Attributes input)
            {
                Varyings output;
                output.positionWS = TransformObjectToWorld(input.positionOS.xyz);
                output.positionCS = TransformWorldToHClip(output.positionWS);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                half3 albedo = _UsePatchColors > 0.5
                    ? PixelPassSamplePatchAlbedo(input.positionWS)
                    : _Albedo1.rgb;

                float3 anchorWS = PixelPassGrassTerrainAnchor(input.positionWS);
                half band = PixelPassGrassEvaluateTerrainLightBand(
                    anchorWS,
                    _ShadeSteps,
                    _Wrap,
                    _Steepness,
                    _ThresholdGradientSize,
                    _SunCloudMix,
                    _ShadowAtTuftBase);

                return half4(albedo * GetMainLight().color * band, 1.0);
            }
            ENDHLSL
        }
    }

    FallBack Off
}
