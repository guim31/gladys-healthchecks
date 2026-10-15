# Healthchecks

[Healthchecks](https://healthchecks.io/) vigila sus tareas programadas: una
tarea cron, una copia de seguridad, una renovación de certificado o cualquier
script hace « ping » a una dirección cuando se ejecuta, y Healthchecks da la
alarma cuando el ping no llega. Esta integración trae los controles de un
proyecto Healthchecks a Gladys, ya use healthchecks.io o su propio servidor:
cada control se convierte en un dispositivo con su estado, su último ping y el
siguiente esperado. Las escenas pueden reaccionar cuando **cualquier** control
cae, se retrasa o se restablece, un widget muestra primero los controles caídos,
y las escenas pueden pausar, reanudar o enviar un ping a un control.

Probada con un Healthchecks v4.4 autoalojado real (Docker); todavía no en
healthchecks.io: sus comentarios son bienvenidos en
[las issues](https://github.com/guim31/gladys-healthchecks/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un proyecto Healthchecks: en [healthchecks.io](https://healthchecks.io/)
  (incluido el plan gratuito) o en su propio servidor Healthchecks, accesible
  desde la máquina de Gladys.
- Una clave de API del proyecto. La clave **de solo lectura** basta para seguir
  los controles; la clave **completa** permite además pausar, reanudar y
  « Enviar un ping ».

La integración hace una petición por intervalo de actualización (un minuto por
defecto): muy por debajo de lo que acepta healthchecks.io.

## Primeros pasos

### 1. Crear una clave de API

En Healthchecks, abra su proyecto y luego **Settings** → **API Access** →
**Create API Keys**. Aparecen dos claves: la completa (« API key ») y la de solo
lectura. Copie la que quiera: Healthchecks la vuelve a mostrar más tarde, pero
manténgala en privado.

### 2. Configurar la integración

En Gladys, abra **Integraciones → Healthchecks → Configuración**:

- **Dirección de Healthchecks**: `https://healthchecks.io` (por defecto), o la
  dirección de su servidor, la de su ajuste `SITE_ROOT` (por ejemplo
  `http://192.168.1.2:8000`).
- **Clave de API**: la clave copiada arriba.
- **Intervalo de actualización**: de 30 segundos a 5 minutos.
- **Idioma de los nombres**: idioma de los nombres de las funciones, de los
  estados y de los resultados de escena (francés por defecto).

Guarde y haga clic en **Probar la conexión**: el resultado da el número de
controles, los caídos o con retraso, e indica si la clave es de solo lectura.

### 3. Añadir los controles

Abra la pestaña **Descubrir**: un dispositivo « Healthchecks » resume el
proyecto, y cada control se propone con su nombre. Añada los que quiera ver en
Gladys. Los desencadenantes de escena valen para todos los controles, añadidos
o no.

## Los dispositivos

Cada control se convierte en un dispositivo con:

- **Estado**: Puntual, Con retraso, Caído, En ejecución, En pausa o Nuevo, como
  texto.
- **Funciona**: No (rojo) cuando el control está caído, Sí (verde) en los demás
  casos (puntual, con retraso, en ejecución, nuevo o en pausa). Útil como
  condición de escena.
- **Último ping**: día/mes y hora del último ping.
- **Próximo ping esperado**: cuándo el control pasará a con retraso sin un
  nuevo ping; « - » cuando no se espera nada (control caído, en pausa o nuevo).
- **Pings recibidos**: el contador de Healthchecks.
- **Duración de la última ejecución**: en segundos, entre las señales « start »
  y « success », para los controles que envían una señal de inicio (`/start`).

El dispositivo **Healthchecks** del proyecto cuenta los **Controles caídos**,
los **Controles con retraso** y los **Controles en total**.

Último ping, próximo ping, pings y duración se envían como mucho cada 5 minutos
por control (al instante cuando cambia el estado), para respetar los límites de
Gladys.

## Panel

El widget **Healthchecks** muestra tres mosaicos (caídos, con retraso,
puntuales) y luego una fila por control: primero los caídos, luego los
retrasados, luego en ejecución, nuevos, en pausa y puntuales, con el estado y el
último ping. Diez filas como máximo; el resto se cuenta. En los ajustes del
widget, elija algunos controles para mostrar solo esos (dispositivos añadidos a
Gladys). El botón **Actualizar** vuelve a leer Healthchecks.

## Escenas

### Desencadenantes

- **Un control cae**: ningún ping antes del fin de su periodo de gracia, o una
  señal de fallo (`/fail`). Variables: nombre del control, etiquetas, último
  ping.
- **Un control se restablece**: un control caído recibe de nuevo un ping.
  Variables: las mismas, más la duración de la caída en minutos.
- **Un control se retrasa**: el ping esperado no llegó y empieza el periodo de
  gracia: aún hay tiempo de actuar antes de que caiga.

Cada desencadenante puede limitarse a algunos controles (vacío: todos). El
estado se guarda en el volumen `/data`: un control que cayó durante un reinicio
de Gladys o de la integración se anuncia una vez en la lectura siguiente. No se
anuncia nada en la primera lectura, ni para un control pausado, reanudado o en
ejecución.

### Acciones

- **Estado de un control**: da `down` (sí/no), el estado en palabras
  (`state`), el nombre (`name`), el último ping (`last_ping`) y una frase lista
  (`sentence`), por ejemplo « Copia nocturna: Caído, último ping 14/10 03:12. ».
- **Contar los controles caídos**: caídos, con retraso, en total, y los nombres
  de los controles caídos.
- **Pausar un control** y **Reanudar un control**: para un mantenimiento
  previsto (clave de API completa). Un control reanudado espera su próximo
  ping.
- **Enviar un ping**: envía la señal de éxito de un control (clave de API
  completa), para que una escena de Gladys indique por sí misma que se ejecutó.

### Ideas de escenas

- Cuando **Un control cae**, limitado a los controles de copia de seguridad en
  su campo Controles, enviar un mensaje de Telegram « La copia de seguridad no
  se ejecutó, último ping {{last_ping}} ».
- Cada mañana a las 8:00, **Contar los controles caídos** y, si hay al menos
  uno, leer sus nombres en el altavoz.
- En una escena nocturna de Gladys (riego, programación de la calefacción…),
  terminar con **Enviar un ping** a un control dedicado: Healthchecks le avisa
  si Gladys dejó de ejecutarla.
- Antes de apagar el NAS para un mantenimiento, **Pausar un control** de la
  copia de seguridad, y **Reanudar un control** cuando vuelva.

## Solución de problemas

- **Clave de API rechazada**: cópiela de nuevo desde Settings → API Access del
  proyecto correcto; cada proyecto tiene sus propias claves.
- **No hay ningún Healthchecks en esta dirección**: compruebe la dirección; para
  su propio servidor es la de `SITE_ROOT`, con su subruta si la tiene.
- **La dirección redirige**: introduzca la dirección final, normalmente en
  `https://`. La integración no sigue redirecciones, para que la clave nunca se
  envíe a otro sitio.
- **Certificado rechazado**: no se acepta un certificado autofirmado; use la
  dirección `http://` en la red local, o un certificado reconocido.
- **Se necesita la clave de API completa**: pausar, reanudar y enviar un ping
  necesitan la clave completa, no la de solo lectura.
- **Enviar un ping falla en un servidor autoalojado**: Healthchecks construye la
  dirección de ping a partir de su ajuste `PING_ENDPOINT` (o `SITE_ROOT`);
  Gladys debe poder alcanzarla.

## Límites

- Un proyecto por configuración (una clave de API = un proyecto).
- La integración lee Healthchecks: un control no se crea ni se modifica desde
  Gladys.
- Una caída breve entre dos lecturas puede pasar desapercibida en los estados
  de los dispositivos; Healthchecks conserva todo el historial.
- « En ejecución » (una señal de inicio sin su final) no cambia el estado que
  siguen los desencadenantes.
- Desarrollada sin acceso a una cuenta de healthchecks.io: probada con el
  servidor autoalojado (misma API). Sus comentarios son bienvenidos.
