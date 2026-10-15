#ifndef PIXELPASS_GRASS_COMMON_INCLUDED
#define PIXELPASS_GRASS_COMMON_INCLUDED

#include "Packages/com.unity.render-pipelines.core/ShaderLibrary/Common.hlsl"
#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

#define PIXELPASS_GRASS_MAX_CHARACTERS 64

float PixelPassGrassHash(float n)
{
    return frac(sin(n * 12.9898) * 43758.5453);
}

float PixelPassGrassLocationSeed(float2 location)
{
    return frac(sin(dot(location, float2(12.9898, 78.233))) * 43758.5453123);
}

float2 PixelPassGrassRotateVec2(float2 value, float angleDegrees)
{
    float angle = angleDegrees * (PI / 180.0);
    float c = cos(angle);
    float s = sin(angle);
    return float2(value.x * c - value.y * s, value.x * s + value.y * c);
}

float3x3 PixelPassGrassRotateAxis(float3 axis, float angle)
{
    axis = normalize(axis);
    float c = cos(angle);
    float s = sin(angle);
    float oc = 1.0 - c;

    return float3x3(
        oc * axis.x * axis.x + c, oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s,
        oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z - axis.x * s,
        oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c);
}

float3x3 PixelPassGrassViewRotateZ(float angle)
{
    float c = cos(angle);
    float s = sin(angle);
    return float3x3(
        c, -s, 0.0,
        s, c, 0.0,
        0.0, 0.0, 1.0);
}

float PixelPassGrassQuantisedTime(float3 objectOrigin, float framerate, float quantised, float time)
{
    float frametime = 1.0 / max(framerate, 0.001);
    float seed = 10.0 * PixelPassGrassLocationSeed(objectOrigin.xz);
    float phase = frac(seed / frametime) * frametime;
    if (quantised > 0.5)
    {
        time += phase;
        time = round(time * framerate) / framerate;
    }
    return time;
}

// Dylearn billboard: replace model rotation with camera axes, keep instance translation.
float3 PixelPassGrassBillboardWorldPos(float3 objectOriginWS, float3 positionOS)
{
    float3 cameraRight = normalize(UNITY_MATRIX_I_V[0].xyz);
    float3 cameraUp = normalize(UNITY_MATRIX_I_V[1].xyz);
    return objectOriginWS + cameraRight * positionOS.x + cameraUp * positionOS.y;
}

#endif
