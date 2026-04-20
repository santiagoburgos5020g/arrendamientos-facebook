# Cómo obtener tu API Key de Apify

## Paso 1: Crear una cuenta en Apify

1. Ve a [https://apify.com](https://apify.com)
2. Haz clic en "Sign up" (Registrarse)
3. Puedes registrarte con tu email, Google o GitHub
4. Confirma tu email si es necesario

## Paso 2: Navegar al Facebook Groups Scraper

1. Una vez dentro de tu cuenta, ve a [https://apify.com/apify/facebook-groups-scraper](https://apify.com/apify/facebook-groups-scraper)
2. Este es el actor que usaremos para extraer publicaciones de grupos de Facebook

## Paso 3: Obtener tu API Key

1. Haz clic en tu avatar/foto de perfil en la esquina superior derecha
2. Selecciona "Settings" (Configuración)
3. En el menú lateral, haz clic en "Integrations"
4. Verás tu "Personal API token"
5. Haz clic en el botón de copiar para copiar tu token

## Paso 4: Configurar el archivo .env

1. En la raíz del proyecto, copia el archivo de ejemplo:
   ```
   cp .env.example .env
   ```
2. Abre el archivo `.env` y reemplaza el valor:
   ```
   APIFY_API_KEY=tu_api_key_aqui
   ```

## Paso 5: Verificar que funciona

Puedes verificar que tu API key funciona ejecutando este comando:

```bash
curl "https://api.apify.com/v2/acts?token=TU_API_KEY" | head -c 200
```

Si ves una respuesta JSON con datos de actores, tu key está funcionando correctamente.
