function get_font_metadata(fontBytes) {

  s_t_ascenders = AscenderFont(fontBytes)
  s_t_descenders = DescenderFont(fontBytes)
  units_per_em = UnitsPerEm(fontBytes)
  return {
    "FONT_STYPOASCENDERS" : s_type_ascenders,
    "FONT_STYPODESCENDERS" : s_typo_descenders,
    "FONT_UNITS_PER_EM": units_per_em
  }
}

function AscenderFont(fontBytes) {
  return 0
}

function DescenderFont(fontBytes) {
  return 0
}

function UnitsPerEm(fontBytes) {
  return 0
}