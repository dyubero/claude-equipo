// Los catálogos de textos: que los dos idiomas digan lo mismo, y que los textos cambiados en los ajustes valgan.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CATALOGOS, comprobarTextos, huecos, idiomaDe, textos } from '../../textos/indice.mjs'

describe('catálogos de textos', () => {
  test('español e inglés tienen las mismas claves, y cada clave los mismos huecos', () => {
    const { es, en } = CATALOGOS
    assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort())
    for (const clave of Object.keys(es)) assert.deepEqual(huecos(en[clave]), huecos(es[clave]), `huecos de «${clave}»`)
  })

  test('ningún texto queda vacío ni igual en los dos idiomas sin motivo', () => {
    const { es, en } = CATALOGOS
    // Lo que es igual en los dos: marcas, nombres propios y plantillas que solo llevan huecos.
    const iguales = new Set(['guarda.tuRama', 'lote.pruebasSinCompilar'])
    for (const [clave, texto] of Object.entries(es)) {
      assert.ok(texto.length > 0 && en[clave].length > 0, clave)
      // Sin los huecos ni el nombre del plugin, lo que queda con palabras tiene que estar traducido.
      const palabras = texto.replace(/\{[A-Za-z]+\}/g, '').replace(/equipo/g, '')
      if (!iguales.has(clave) && /[a-záéíóúñ]{4}/i.test(palabras)) assert.notEqual(en[clave], texto, `«${clave}» está sin traducir`)
    }
  })

  test('el idioma sale de los ajustes; sin catálogo para él, inglés', () => {
    assert.equal(idiomaDe('es'), 'es')
    assert.equal(idiomaDe('es-MX'), 'es')
    assert.equal(idiomaDe('EN'), 'en')
    assert.equal(idiomaDe('fr'), 'en')
    assert.equal(idiomaDe(undefined), 'en')
    assert.equal(textos('es')('estado.enCola'), 'en cola')
    assert.equal(textos('fr')('estado.enCola'), 'queued')
    assert.equal(textos()('fusion.mensaje', { rama: 'ana/carrito', principal: 'main', resumen: 'descuentos' }), 'Fusión de ana/carrito en main: descuentos')
    assert.equal(textos('en')('fusion.mensaje', { rama: 'ana/cart', principal: 'main', resumen: 'discounts' }), 'Merge ana/cart into main: discounts')
  })

  test('un texto de los ajustes sustituye al del catálogo; lo que se mete en un hueco no se vuelve a leer', () => {
    const t = textos('es', { 'fusion.mensaje': 'merge({rama}): {resumen}' })
    assert.equal(t('fusion.mensaje', { rama: 'carrito', principal: 'main', resumen: 'usa {principal}' }), 'merge(carrito): usa {principal}')
    assert.equal(t('fusion.mensajeSinResumen', { rama: 'carrito', principal: 'main' }), 'Fusión de carrito en main')
    assert.equal(t('no.existe'), 'no.existe')
  })

  test('comprobarTextos avisa de las claves que no existen y de los huecos que el texto no tiene', () => {
    assert.deepEqual(comprobarTextos({ 'fusion.mensaje': 'merge({rama}): {resumen}' }), [])
    assert.deepEqual(comprobarTextos(undefined), [])
    const problemas = comprobarTextos({ 'fusion.mensage': 'x', 'fusion.mensaje': '{rama} por {autor}' })
    assert.match(problemas[0], /«textos\.fusion\.mensage» no es un texto del plugin/)
    assert.match(problemas[1], /«textos\.fusion\.mensaje» usa \{autor\}, que ese texto no tiene \(tiene: \{principal\}, \{rama\}, \{resumen\}\)/)
  })
})
