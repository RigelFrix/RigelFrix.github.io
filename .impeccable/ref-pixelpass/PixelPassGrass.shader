Shader "PixelPass/Grass"
{
    Properties
    {
        [MainTexture] _GrassLeafTex("Grass Leaf", 2D) = "white" {}
        [MainColor] _Albedo1("Albedo 1", Color) = (0.443, 0.635, 0, 1)

        _Albedo2("Albedo 2", Color) = (0.557, 0.678, 0.212, 1)
        _Albedo2Scale("Albedo 2 Scale", Float) = 0.11
        _Albedo2Threshold("Albedo 2 Threshold", Range(0, 1)) = 0.537
        _Albedo2Noise("Albedo 2 Noise", 2D) = "gray" {}

        _Albedo3("Albedo 3", Color) = (0.502, 0.655, 0.224, 1)
        _Albedo3Scale("Albedo 3 Scale", Float) = 0.1
        _Albedo3Threshold("Albedo 3 Threshold", Range(0, 1)) = 0.471
        _Albedo3Noise("Albedo 3 Noise", 2D) = "gray" {}

        _AccentLeafTex1("Accent Leaf 1", 2D) = "white" {}
        _AccentAlbedo1("Accent Albedo 1", Color) = (0.604, 0.718, 0, 1)
        _AccentFrequency1("Accent Frequency 1", Range(0, 0.05)) = 0.001
        _AccentHeight1("Accent Height 1", Range(0, 1)) = 0.1
        _AccentScale1("Accent Scale 1", Range(0, 2)) = 1

        _AccentLeafTex2("Accent Leaf 2", 2D) = "white" {}
        _AccentAlbedo2("Accent Albedo 2", Color) = (0.424, 0.604, 0, 1)
        _AccentProbability2("Accent Probability 2", Range(0, 0.05)) = 0.0001
        _AccentHeight2("Accent Height 2", Range(0, 1)) = 0.185
        _AccentScale2("Accent Scale 2", Range(0, 2)) = 1

        _GrassFramerate("Step Framerate", Float) = 5
        [Toggle] _GrassQuantised("Quantised Framerate", Float) = 1
        [Toggle] _WorldSpaceSway("World Space Sway", Float) = 1
        [Toggle] _ViewSpaceSway("View Space Sway", Float) = 1
        _WorldSwayAngle("World Sway Angle", Range(0, 180)) = 60
        _FakePerspectiveScale("Fake Perspective Scale", Range(-0.15, 0.6)) = 0.3
        _WindNoise("Wind Noise", 2D) = "gray" {}
        _WindNoiseThreshold("Wind Threshold", Range(-1, 1)) = 0.365
        _WindNoiseScale("Wind Scale", Range(0, 0.1)) = 0.071
        _WindNoiseSpeed("Wind Speed", Range(0, 0.2)) = 0.025
        _WindDirection("Wind Direction", Vector) = (0, 1, 0, 0)
        _WindDivergeAngle("Wind Diverge Angle", Range(0, 45)) = 10
        _ViewSwaySpeed("View Sway Speed", Range(0, 5)) = 0.1
        _ViewSwayAngle("View Sway Angle", Range(0, 45)) = 10

        [Toggle] _CharacterDisplacement("Character Displacement", Float) = 1
        _PlayerDisplacementAngleZ("Displacement Angle Z", Range(0, 360)) = 60
        _PlayerDisplacementAngleX("Displacement Angle X", Range(0, 360)) = 62.7
        _RadiusExponent("Radius Exponent", Range(0, 10)) = 0.9

        _ShadeSteps("Shade Steps", Range(1, 8)) = 3
        _Wrap("Wrap", Range(-2, 2)) = 0
        _Steepness("Steepness", Range(1, 8)) = 1
        _ThresholdGradientSize("Hybrid Gradient Size", Range(0, 1)) = 0.15
        _Cutoff("Alpha Cutoff", Range(0, 1)) = 0.99

        [Header(PixelPass Stylize)]
        [Toggle] _ShadowAtTuftBase("Shadow At Tuft Base", Float) = 1
        _SunCloudMix("Cloud Influence", Range(0, 1)) = 1
        [Toggle] _UsePatchColors("Use Patch Colours", Float) = 0
    }

    SubShader
    {
        Tags
        {
            "RenderType" = "TransparentCutout"
            "Queue" = "AlphaTest"
            "RenderPipeline" = "UniversalPipeline"
        }

        Pass
        {
            Name "GrassForward"
            Tags { "LightMode" = "UniversalForward" }

            Cull Off
            ZWrite On

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_instancing
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "../../ShaderLibrary/PixelPassBanding.hlsl"
            #include "../../World/ShaderLibrary/PixelPassWorldClouds.hlsl"
            #include "../ShaderLibrary/PixelPassGrassCommon.hlsl"
            #include "../ShaderLibrary/PixelPassGrassDisplacement.hlsl"
            #include "../ShaderLibrary/PixelPassGrassStylize.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _Albedo1;
                float4 _Albedo2;
                float4 _Albedo3;
                float _Albedo2Scale;
                float _Albedo2Threshold;
                float _Albedo3Scale;
                float _Albedo3Threshold;
                float4 _AccentAlbedo1;
                float4 _AccentAlbedo2;
                float _AccentFrequency1;
                float _AccentHeight1;
                float _AccentScale1;
                float _AccentProbability2;
                float _AccentHeight2;
                float _AccentScale2;
                float _GrassFramerate;
                float _GrassQuantised;
                float _WorldSpaceSway;
                float _ViewSpaceSway;
                float _WorldSwayAngle;
                float _FakePerspectiveScale;
                float _WindNoiseThreshold;
                float _WindNoiseScale;
                float _WindNoiseSpeed;
                float4 _WindDirection;
                float _WindDivergeAngle;
                float _ViewSwaySpeed;
                float _ViewSwayAngle;
                float _ShadeSteps;
                float _Wrap;
                float _Steepness;
                float _ThresholdGradientSize;
                float _Cutoff;
                float _ShadowAtTuftBase;
                float _SunCloudMix;
                float _UsePatchColors;
                float _GrassShaderTime;
            CBUFFER_END

            TEXTURE2D(_WindNoise);
            SAMPLER(sampler_WindNoise);

            #include "../ShaderLibrary/PixelPassGrassWind.hlsl"

            TEXTURE2D(_Albedo2Noise);
            SAMPLER(sampler_Albedo2Noise);
            TEXTURE2D(_Albedo3Noise);
            SAMPLER(sampler_Albedo3Noise);

            #include "../../World/ShaderLibrary/PixelPassWorldPatch.hlsl"

            TEXTURE2D(_GrassLeafTex);
            SAMPLER(sampler_GrassLeafTex);
            TEXTURE2D(_AccentLeafTex1);
            SAMPLER(sampler_AccentLeafTex1);
            TEXTURE2D(_AccentLeafTex2);
            SAMPLER(sampler_AccentLeafTex2);

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 objectOriginWS : TEXCOORD1;
                float windSample : TEXCOORD2;
                float fakePerspectiveY : TEXCOORD3;
                float idSeed1 : TEXCOORD4;
                float idSeed2 : TEXCOORD5;
                float3 normalWS : TEXCOORD6;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            Varyings Vert(Attributes input)
            {
                Varyings output;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, output);

                #ifdef UNITY_INSTANCING_ENABLED
                    float instanceId = unity_InstanceID;
                #else
                    float instanceId = 0.0;
                #endif
                float idSeed1 = PixelPassGrassHash(instanceId);
                float idSeed2 = PixelPassGrassHash(instanceId + PI);

                float3 positionOS = input.positionOS.xyz;
                if (idSeed1 < _AccentFrequency1)
                {
                    positionOS.y += _AccentHeight1;
                    positionOS.xy *= _AccentScale1;
                }
                else if (idSeed2 < _AccentProbability2)
                {
                    positionOS.y += _AccentHeight2;
                    positionOS.xy *= _AccentScale2;
                }

                float3 objectOriginWS = TransformObjectToWorld(float3(0.0, 0.0, 0.0));
                float shaderTime = _GrassShaderTime > 0.0 ? _GrassShaderTime : _Time.y;
                float time = PixelPassGrassQuantisedTime(objectOriginWS, _GrassFramerate, _GrassQuantised, shaderTime);
                float instanceSeed = 10.0 * PixelPassGrassLocationSeed(objectOriginWS.xz);

                // Dylearn order: view sway -> displacement -> world sway -> billboard.
                PixelPassGrassApplyViewSway(positionOS, instanceSeed, time);

                float fakePerspectiveY = 0.0;
                PixelPassGrassApplyCharacterDisplacement(positionOS, objectOriginWS, fakePerspectiveY);

                float windSample = PixelPassGrassApplyWorldSway(positionOS, objectOriginWS, time);

                float3 worldPos = PixelPassGrassBillboardWorldPos(objectOriginWS, positionOS);

                output.positionCS = TransformWorldToHClip(worldPos);
                output.uv = input.uv;
                output.objectOriginWS = objectOriginWS;
                output.windSample = windSample;
                output.fakePerspectiveY = fakePerspectiveY;
                output.idSeed1 = idSeed1;
                output.idSeed2 = idSeed2;
                // World-up lighting stays stable when the camera rotates (Cyanilux / stylized grass standard).
                output.normalWS = float3(0.0, 1.0, 0.0);
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);

                float2 uv = input.uv;
                uv.x -= 0.5;
                float windPerspective = input.windSample * _FakePerspectiveScale;
                if (_WorldSpaceSway > 0.5)
                {
                    float3 cameraForward = -UNITY_MATRIX_V[2].xyz;
                    windPerspective *= dot(normalize(cameraForward.xz), normalize(_WindDirection.xy + 1e-5));
                    // tehkato GrassBlade: tip-heavy UV squash for fake depth when wind blows.
                    uv.x *= uv.y * windPerspective + 1.0;
                }
                if (_DisplacementParams.w > 0.5)
                    uv.x *= (1.0 - uv.y) * -input.fakePerspectiveY + 1.0;
                uv.x += 0.5;
                uv.x = saturate(uv.x);

                half4 leaf = SAMPLE_TEXTURE2D(_GrassLeafTex, sampler_GrassLeafTex, uv);
                if (input.idSeed1 < _AccentFrequency1)
                    leaf = SAMPLE_TEXTURE2D(_AccentLeafTex1, sampler_AccentLeafTex1, uv);
                else if (input.idSeed2 < _AccentProbability2)
                    leaf = SAMPLE_TEXTURE2D(_AccentLeafTex2, sampler_AccentLeafTex2, uv);

                clip(leaf.a - _Cutoff);

                // Flat green by default; optional Dylearn patch overrides when _UsePatchColors is on.
                half3 albedo = _Albedo1.rgb * leaf.rgb;
                if (_UsePatchColors > 0.5)
                {
                    float3 patchColor;
                    int patchIndex;
                    PixelPassSamplePatchAlbedoDetailed(input.objectOriginWS, patchColor, patchIndex);
                    albedo = patchIndex == 0 ? _Albedo1.rgb * leaf.rgb : patchColor;
                }

                if (input.idSeed1 < _AccentFrequency1)
                    albedo = _AccentAlbedo1.rgb * leaf.rgb;
                else if (input.idSeed2 < _AccentProbability2)
                    albedo = _AccentAlbedo2.rgb * leaf.rgb;

                float3 anchorWS = PixelPassGrassTerrainAnchor(input.objectOriginWS);
                half band = PixelPassGrassEvaluateTerrainLightBand(
                    anchorWS,
                    _ShadeSteps,
                    _Wrap,
                    _Steepness,
                    _ThresholdGradientSize,
                    _SunCloudMix,
                    _ShadowAtTuftBase);

                half3 color = albedo * GetMainLight().color * band;
                return half4(color, 1.0);
            }
            ENDHLSL
        }
    }

    FallBack Off
}
