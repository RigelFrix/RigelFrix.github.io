#ifndef PIXELPASS_GRASS_WIND_INCLUDED
#define PIXELPASS_GRASS_WIND_INCLUDED

#include "PixelPassGrassCommon.hlsl"

// Consumer must declare these in UnityPerMaterial (matches material inspector / tehkato GrassBlade).
// TEXTURE2D(_WindNoise) + sampler declared in grass shader.

float PixelPassGrassSampleWind(float3 objectOrigin, float time)
{
    float2 direction = _WindDirection.xy;
    float2 dir1 = PixelPassGrassRotateVec2(direction, _WindDivergeAngle);
    float2 dir2 = PixelPassGrassRotateVec2(direction, -_WindDivergeAngle);
    float2 scroll1 = time * _WindNoiseSpeed * normalize(dir1 + 1e-5);
    float2 scroll2 = time * _WindNoiseSpeed * normalize(dir2 + 1e-5);

    float sample1 = SAMPLE_TEXTURE2D_LOD(_WindNoise, sampler_PointRepeat, objectOrigin.xz * _WindNoiseScale + scroll1, 0).r;
    float sample2 = SAMPLE_TEXTURE2D_LOD(
        _WindNoise,
        sampler_PointRepeat,
        objectOrigin.xz * (_WindNoiseScale * 0.8) + scroll2 * (0.89 * PI / 3.0),
        0).r;

    float windSample = saturate(sample1 * sample2 + _WindNoiseThreshold);
    return (windSample - 0.5) * 2.0;
}

void PixelPassGrassApplyViewSway(inout float3 positionOS, float instanceSeed, float time)
{
    if (_ViewSpaceSway < 0.5)
        return;

    float modelSway = sin((time + instanceSeed) * _ViewSwaySpeed * TWO_PI) * radians(_ViewSwayAngle);
    positionOS = mul(PixelPassGrassViewRotateZ(modelSway), positionOS);
}

// tehkato / GrassBlade: rotate in billboard-local XY before camera alignment (half angle).
float PixelPassGrassApplyWorldSway(inout float3 positionOS, float3 objectOrigin, float time)
{
    if (_WorldSpaceSway < 0.5)
        return 0.0;

    float windSample = PixelPassGrassSampleWind(objectOrigin, time);
    float windAngle = windSample * radians(_WorldSwayAngle) * 0.5;
    float sinW = sin(windAngle);
    float cosW = cos(windAngle);
    float rotatedX = positionOS.x * cosW - positionOS.y * sinW;
    float rotatedY = positionOS.x * sinW + positionOS.y * cosW;
    positionOS.x = rotatedX;
    positionOS.y = rotatedY;
    return windSample;
}

#endif
