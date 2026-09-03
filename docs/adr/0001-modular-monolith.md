# 0001 — Monolito modular en vez de microservicios

## Contexto

`tasks-platform` es una API de gestion de tareas multi-tenant: organizaciones,
usuarios con roles, proyectos, tareas, y una superficie de integracion via API
keys y webhooks salientes. El equipo que la construye y la opera es pequeno, y
no hay indicios de que distintas partes del sistema vayan a necesitar escalar
de forma independiente en el corto o mediano plazo.

## Decision

El sistema se construye como un monolito modular: un unico proceso Node.js
(mas un worker para trabajo asincrono) organizado en modulos por dominio
(`modules/<dominio>/`), cada uno con sus propias capas internas (rutas,
controller, service, repository). Un modulo no importa el interior de otro:
si necesita algo de otro dominio, lo pide a traves de su servicio publico.

## Alternativas consideradas

- **Microservicios desde el inicio.** Un servicio por dominio (usuarios,
  proyectos, webhooks, etc.), cada uno con su propio despliegue y, posiblemente,
  su propia base de datos.
- **Monolito no modular.** Un solo proceso sin fronteras internas claras entre
  dominios.

## Por que no microservicios

- No hay necesidad de escalado independiente: los distintos dominios de esta
  API tienen patrones de carga similares y no justifican escalar por separado.
- No hay fronteras de equipo que microservicios ayuden a respetar: un unico
  equipo trabaja sobre todo el sistema.
- Los microservicios introducen complejidad operativa real (orquestacion,
  observabilidad distribuida, consistencia eventual entre servicios,
  despliegues coordinados) que no se justifica sin una razon de negocio
  concreta que la exija.

## Por que no un monolito sin modularizar

- Sin fronteras internas claras, el codigo tiende a acoplarse de formas que
  hacen cada vez mas caro cambiarlo, y a mezclar reglas de negocio de distintos
  dominios.
- Modularizar por dominio desde el principio deja la puerta abierta a extraer
  un modulo a un servicio aparte el dia que una razon de negocio lo justifique,
  sin tener que rediseñar el sistema desde cero.

## Consecuencias

- Todo el sistema corre en un solo proceso: un despliegue, una base de datos,
  un ciclo de release.
- La regla de capas (`routes → controller → service → repository`) y la regla
  de que un modulo no importa el interior de otro se vuelven la principal
  defensa contra el acoplamiento que normalmente se evita separando en
  servicios. Si no se respetan con disciplina, el monolito puede degradar en
  el "monolito no modular" que se buscaba evitar.
- Si en el futuro un modulo concreto (por ejemplo, el procesamiento de
  webhooks) necesita escalar o desplegarse de forma independiente, la
  modularizacion actual reduce el costo de extraerlo.
