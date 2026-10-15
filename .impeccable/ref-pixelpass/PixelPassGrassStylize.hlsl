#ifndef PIXELPASS_GRASS_STYLIZE_INCLUDED
#define PIXELPASS_GRASS_STYLIZE_INCLUDED

#include "../../ShaderLibrary/PixelPassBanding.hlsl"
#include "../../World/ShaderLibrary/PixelPassWorldClouds.hlsl"
#include "../../ShaderLibrary/PixelPassLighting.hlsl"

// David Holland / Dylearn grass fake: evaluate sun + cloud once at the tuft base (ground anchor)
// and apply the same band to every fragment on the billboard. Matches floor lighting at the same XZ.
// https://www.davidhol.land/articles/3d-pixel-art-rendering/
float3 PixelPassGrassTerrainAnchor(float3 worldPositionWS)
{
    return worldPositionWS;
}

half PixelPassGrassEvaluateTerrainLightBand(
    float3 terrainAnchorWS,
    half shadeSteps,
    half wrap,
    half steepness,
    half hybridGradientSize,
    half cloudInfluence,
    half shadowAtTuftBase)
{
    half3 normalWS = half3(0.0h, 1.0h, 0.0h);

    Light mainLight;
#if defined(_MAIN_LIGHT_SHADOWS) || defined(_MAIN_LIGHT_SHADOWS_CASCADE)
    if (shadowAtTuftBase > 0.5h)
    {
        float4 shadowCoord = TransformWorldToShadowCoord(terrainAnchorWS);
        mainLight = GetMainLight(shadowCoord);
    }
    else
#endif
    {
        mainLight = GetMainLight();
    }

    half sun = saturate(dot(normalWS, mainLight.direction) + wrap) * steepness;
#if defined(_MAIN_LIGHT_SHADOWS) || defined(_MAIN_LIGHT_SHADOWS_CASCADE)
    if (shadowAtTuftBase > 0.5h)
        sun *= PixelPassRemapMainLightShadow(mainLight.shadowAttenuation);
#endif

    half cloud = (half)PixelPassSampleCloudShade(terrainAnchorWS);
    half combined = lerp(sun, min(sun, cloud), saturate(cloudInfluence));
    return PixelPassQuantizeLightDylearnHybrid(combined, shadeSteps, hybridGradientSize);
}

#endif
