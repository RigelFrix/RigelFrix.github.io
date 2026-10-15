#ifndef PIXELPASS_GRASS_DISPLACEMENT_INCLUDED
#define PIXELPASS_GRASS_DISPLACEMENT_INCLUDED

#include "PixelPassGrassCommon.hlsl"

CBUFFER_START(PixelPassGrassDisplacement)
    float4 _DisplacementParams; // x angleZ, y angleX, z radiusExponent, w enabled
    int _CharacterCount;
CBUFFER_END

float4 _CharacterPositions[PIXELPASS_GRASS_MAX_CHARACTERS];

void PixelPassGrassApplyCharacterDisplacement(inout float3 positionOS, float3 objectOrigin, out float fakePerspectiveY)
{
    fakePerspectiveY = 0.0;
    if (_DisplacementParams.w < 0.5 || _CharacterCount <= 0)
        return;

    float displacementX = 0.0;
    float displacementY = 0.0;
    float3 cameraForward = -UNITY_MATRIX_V[2].xyz;
    float3 perpCamera = float3(cameraForward.z, 0.0, -cameraForward.x);

    UNITY_UNROLL
    for (int i = 0; i < PIXELPASS_GRASS_MAX_CHARACTERS; i++)
    {
        if (i >= _CharacterCount)
            break;

        float4 character = _CharacterPositions[i];
        if (character.w <= 0.0001)
            continue;

        float distance = length(character.xyz - objectOrigin) / character.w;
        float strength = pow(saturate(1.0 - distance), _DisplacementParams.z);
        if (strength <= 0.0)
            continue;

        float3 toGrass = objectOrigin - character.xyz;
        float viewYDot = dot(normalize(cameraForward.xz), normalize(toGrass.xz));
        float viewXDot = dot(normalize(perpCamera.xz), normalize(toGrass.xz));
        displacementX += strength * viewXDot;
        displacementY += strength * viewYDot;
    }

    displacementX = clamp(displacementX, -1.0, 1.0);
    displacementY = clamp(displacementY, -1.0, 1.0);
    fakePerspectiveY = displacementY;

    float3x3 rotZ = PixelPassGrassRotateAxis(float3(0.0, 0.0, 1.0), displacementX * radians(_DisplacementParams.x));
    float3x3 rotX = PixelPassGrassRotateAxis(float3(1.0, 0.0, 0.0), displacementY * radians(_DisplacementParams.y));
    positionOS = mul(mul(rotX, rotZ), positionOS);
}

#endif
