export const CURRENT_LEGAL_TEMPLATE_VERSION = "legal_v2_2026_03_31";
export const LEGACY_CONTRACT_TEMPLATE_VERSION = "legacy_contract_v1";
export const LEGACY_RECEIPT_TEMPLATE_VERSION = "legacy_receipt_v1";

type UnknownRecord = Record<string, unknown>;

interface ContractSnapshotInput {
  id: string;
  organization_id: string;
  employee_id: string;
  title: string;
  activity_description: string;
  schedule: string;
  validity_text: string;
  representative_name: string;
  employee_pin_verified: boolean | null;
  participant_verified_at: string | null;
  participant_signed_at: string | null;
  participant_sign_url: string | null;
}

interface ReceiptSnapshotInput {
  id: string;
  organization_id: string;
  employee_id: string;
  settlement_id: string;
  year: number;
  month: number;
  employee_name_snapshot: string;
  hours_worked: number;
  hourly_rate: number;
  amount_earned: number;
  worked_minutes: number;
  slot_count: number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function buildContractOpening(employeeName: string): string {
  return `Entre la Fundacion Ambitos («la Fundacion») y ${employeeName || "—"} («el/la Participante»), ambas partes acuerdan lo siguiente:`;
}

export function buildLegacyContractRenderedContent(employeeName: string): UnknownRecord {
  return {
    schema_version: 1,
    template_version: LEGACY_CONTRACT_TEMPLATE_VERSION,
    title: "Acuerdo de Participacion en Actividad Ocupacional",
    opening: buildContractOpening(employeeName),
    clauses: [
      {
        title: "Primera — Objeto",
        text:
          "El/la Participante se incorpora voluntariamente a la actividad ocupacional de gestion del Punto de Entrega SEUR — Punto Inclusivo, operado por la Fundacion. Esta actividad forma parte de un programa de terapia ocupacional y no constituye relacion laboral de ningun tipo.",
      },
      {
        title: "Segunda — Marco legal",
        text:
          "La presente actividad se enmarca en el Real Decreto 2274/1985, de 4 de diciembre, por el que se regulan los Centros Ocupacionales para personas con discapacidad, y se desarrolla bajo los principios de la terapia ocupacional como profesion sanitaria regulada por la Ley 44/2003 de Ordenacion de las Profesiones Sanitarias, la Ley 24/2014 del Consejo General de Colegios de Terapeutas Ocupacionales y la Ley 1/2017 de la Comunidad de Madrid.",
      },
      {
        title: "Tercera — Horario",
        text:
          "El/la Participante escoge libremente los turnos en los que desea participar cada semana, de acuerdo con la disponibilidad del punto de entrega. No existe obligacion de asistencia minima.",
      },
      {
        title: "Cuarta — Gratificacion",
        text:
          "El/la Participante recibira mensualmente una gratificacion proporcional a las horas efectivamente realizadas durante ese mes. Esta gratificacion tiene caracter terapeutico-ocupacional y no constituye salario ni retribucion laboral. La retribucion se empleara para reforzar las actividades de ocio y tiempo libre.",
      },
      {
        title: "Quinta — Voluntariedad y baja",
        text:
          "La participacion es completamente voluntaria. Cualquiera de las partes puede dar por finalizado este acuerdo en cualquier momento, sin necesidad de preaviso ni penalizacion.",
      },
      {
        title: "Sexta — Seguro y cobertura",
        text:
          "La Fundacion garantiza que el/la Participante esta cubierto/a por un seguro de responsabilidad civil y accidentes durante el desarrollo de la actividad.",
      },
      {
        title: "Septima — Proteccion de datos",
        text:
          "Los datos personales del Participante se tratan conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Organica 3/2018 (LOPDGDD). La Fundacion es responsable del tratamiento, con la finalidad exclusiva de gestionar esta actividad ocupacional. El/la Participante puede ejercer sus derechos de acceso, rectificacion, supresion y portabilidad dirigiendose a la Fundacion.",
      },
      {
        title: "Octava — Vigencia",
        text:
          "Este acuerdo tiene una duracion de tres meses desde la fecha de firma, renovable automaticamente por periodos iguales salvo comunicacion en contrario por cualquiera de las partes.",
      },
    ],
    closing: "Ambas partes firman electronicamente a continuacion en senal de conformidad.",
  };
}

export function buildCurrentContractRenderedContent(employeeName: string): UnknownRecord {
  return {
    schema_version: 2,
    template_version: CURRENT_LEGAL_TEMPLATE_VERSION,
    title: "Acuerdo de Participacion en Actividad Ocupacional",
    opening: buildContractOpening(employeeName),
    clauses: [
      {
        title: "Primera — Objeto",
        text:
          "El/la Participante se incorpora voluntariamente a la actividad ocupacional de gestion del Punto de Entrega SEUR — Punto Inclusivo, operado por la Fundacion. Esta actividad forma parte de un programa de terapia ocupacional y no constituye relacion laboral de ningun tipo.",
      },
      {
        title: "Segunda — Marco legal",
        text:
          "La presente actividad se enmarca en los fines de interes general de Fundacion Ambitos, definidos en sus Estatutos y en la Ley 50/2002, de 26 de diciembre, de Fundaciones, particularmente en lo relativo a la promocion de la inclusion social, la rehabilitacion psicosocial y la mejora de la empleabilidad de personas con trastorno mental grave. El programa tiene la naturaleza de actividad de rehabilitacion psicosocial y ocupacional, inspirada en los principios recogidos en el Real Decreto Legislativo 1/2013, de 29 de noviembre, por el que se aprueba el Texto Refundido de la Ley General de derechos de las personas con discapacidad y de su inclusion social (arts. 51 y 52), y se desarrolla como prestacion de apoyo social en el marco de la Ley 12/2022, de 21 de diciembre, de Servicios Sociales de la Comunidad de Madrid. Esta actividad no constituye en ningun caso un centro ocupacional ni genera relacion laboral alguna entre la persona participante y Fundacion Ambitos, ni con otras entidades colaboradoras en el programa.",
      },
      {
        title: "Tercera — Horario",
        text:
          "El/la Participante escoge libremente los turnos en los que desea participar cada semana, de acuerdo con la disponibilidad del punto de entrega. No existe obligacion de asistencia minima.",
      },
      {
        title: "Cuarta — Gratificacion",
        text:
          "El/la Participante recibira mensualmente una gratificacion proporcional a las horas efectivamente dedicadas al programa durante ese mes. Esta gratificacion tiene exclusivamente caracter de incentivo terapeutico-ocupacional y de reconocimiento de la participacion en actividades de rehabilitacion psicosocial. No constituye salario, retribucion laboral ni contraprestacion economica por prestacion de servicios, y se destina a reforzar las actividades de ocio, tiempo libre y bienestar personal del/la participante. La cuantia de la gratificacion es simbolica y no guarda relacion con el valor de mercado de ninguna prestacion de servicios.",
      },
      {
        title: "Quinta — Voluntariedad y baja",
        text:
          "La participacion es completamente voluntaria. Cualquiera de las partes puede dar por finalizado este acuerdo en cualquier momento, sin necesidad de preaviso ni penalizacion.",
      },
      {
        title: "Sexta — Seguro y cobertura",
        text:
          "La Fundacion garantiza que el/la Participante esta cubierto/a por un seguro de responsabilidad civil y accidentes durante el desarrollo de la actividad.",
      },
      {
        title: "Septima — Proteccion de datos",
        text:
          "Los datos personales del/la Participante, incluidos los relativos a su salud como categoria especial de datos, se tratan conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Organica 3/2018 (LOPDGDD).\n\nResponsable del tratamiento: Fundacion Ambitos (NIF: G85643849), con domicilio en Calle Belmonte de Tajo 52-54, 28019 Madrid. Contacto: tecnologia@ambitos.social.\n\nFinalidad: gestion del programa de rehabilitacion psicosocial 'Punto Inclusivo', incluyendo el registro de participacion, el calculo y abono de gratificaciones, y la coordinacion con profesionales de referencia del/la participante cuando sea necesario para los fines del programa.\n\nBase juridica: articulo 6.1.e) RGPD (mision de interes publico en el ambito de servicios sociales) y articulo 9.2.h) RGPD (tratamiento necesario para la prestacion de asistencia social), en relacion con la Ley 12/2022 de Servicios Sociales de la Comunidad de Madrid y el Real Decreto Legislativo 1/2013.\n\nDestinatarios: equipo del programa, profesionales sanitarios o sociales de referencia del/la participante cuando sea necesario. No se realizan transferencias internacionales de datos.\n\nPlazo de conservacion: los datos se conservaran durante la vigencia del presente acuerdo y, tras su finalizacion, durante los plazos legalmente establecidos para atender posibles responsabilidades.\n\nDerechos: el/la Participante puede ejercer sus derechos de acceso, rectificacion, supresion, portabilidad, limitacion del tratamiento y oposicion, dirigiendose a Fundacion Ambitos en la direccion indicada. Asimismo, tiene derecho a presentar reclamacion ante la Agencia Espanola de Proteccion de Datos (www.aepd.es).",
      },
      {
        title: "Octava — Naturaleza del programa y supervision",
        text:
          "El programa 'Punto Inclusivo' forma parte de las actividades de rehabilitacion psicosocial de Fundacion Ambitos, vinculadas a sus fines estatutarios de inclusion social y apoyo a personas con trastorno mental grave. La actividad se desarrolla bajo la supervision y coordinacion de personal cualificado de la Fundacion, con objetivos terapeuticos y de mejora de la autonomia personal, habilidades sociales y empleabilidad del/la participante. La Fundacion podra coordinar el seguimiento del programa con los profesionales de salud mental de referencia del/la participante, previo conocimiento de este/a.",
      },
      {
        title: "Novena — Vigencia",
        text:
          "Este acuerdo tiene una duracion de tres meses desde la fecha de firma, renovable automaticamente por periodos iguales salvo comunicacion en contrario por cualquiera de las partes.",
      },
    ],
    closing: "Ambas partes firman electronicamente a continuacion en senal de conformidad.",
  };
}

export function buildLegacyReceiptRenderedContent(): UnknownRecord {
  return {
    schema_version: 1,
    template_version: LEGACY_RECEIPT_TEMPLATE_VERSION,
    header_title: "Recibo de Gratificacion Mensual",
    document_title: "Recibo personal de gratificacion mensual",
    intro_text:
      "La persona participante declara haber revisado este documento antes de firmarlo y confirma que los datos mostrados corresponden a su actividad ocupacional en el Punto de Entrega SEUR - Punto Inclusivo.",
    confirmation_text:
      "Con tu firma electronica confirmas haber recibido la gratificacion indicada, correspondiente a las horas efectivamente realizadas durante el periodo mostrado, dentro del programa ocupacional regulado por el Real Decreto 2274/1985.",
    pdf_confirmation_text:
      "El/la participante confirma haber recibido la gratificacion indicada, correspondiente a su participacion en la actividad ocupacional del Punto de Entrega SEUR - Punto Inclusivo, conforme al Real Decreto 2274/1985.",
  };
}

export function buildCurrentReceiptRenderedContent(): UnknownRecord {
  return {
    schema_version: 2,
    template_version: CURRENT_LEGAL_TEMPLATE_VERSION,
    header_title: "Recibo de Gratificacion Terapeutico-Ocupacional",
    document_title: "Recibo personal de gratificacion terapeutico-ocupacional",
    intro_text:
      "La persona participante declara haber revisado este documento antes de firmarlo y confirma que los datos mostrados corresponden a su participacion voluntaria en el programa de rehabilitacion psicosocial 'Punto Inclusivo' de Fundacion Ambitos.",
    confirmation_text:
      "Con tu firma electronica confirmas haber recibido la gratificacion indicada, correspondiente a tu participacion voluntaria en el programa de rehabilitacion psicosocial 'Punto Inclusivo' de Fundacion Ambitos. Esta cantidad tiene caracter de gratificacion terapeutico-ocupacional y no constituye salario ni retribucion laboral, de acuerdo con los fines fundacionales de la entidad (Ley 50/2002, de 26 de diciembre) y el marco de derechos de las personas con discapacidad (Real Decreto Legislativo 1/2013, de 29 de noviembre).",
    pdf_confirmation_text:
      "El/la participante confirma haber recibido la gratificacion indicada, correspondiente a su participacion voluntaria en el programa de rehabilitacion psicosocial 'Punto Inclusivo' de Fundacion Ambitos. Esta cantidad tiene caracter de gratificacion terapeutico-ocupacional y no constituye salario ni retribucion laboral, de acuerdo con los fines fundacionales de la entidad (Ley 50/2002, de 26 de diciembre) y el marco de derechos de las personas con discapacidad (Real Decreto Legislativo 1/2013, de 29 de noviembre).",
  };
}

export function resolveContractRenderedContent(
  snapshot: UnknownRecord | null | undefined,
  employeeName: string,
): UnknownRecord {
  const renderedContent = snapshot?.rendered_content;
  if (renderedContent && typeof renderedContent === "object") {
    return clone(renderedContent as UnknownRecord);
  }
  return buildLegacyContractRenderedContent(employeeName);
}

export function resolveReceiptRenderedContent(
  snapshot: UnknownRecord | null | undefined,
): UnknownRecord {
  const renderedContent = snapshot?.rendered_content;
  if (renderedContent && typeof renderedContent === "object") {
    return clone(renderedContent as UnknownRecord);
  }
  return buildLegacyReceiptRenderedContent();
}

export function buildCurrentContractSnapshot(
  contract: ContractSnapshotInput,
  employeeName: string,
  adminEmployeeId: string,
  adminSignUrl: string,
  adminSignedAt: string,
): UnknownRecord {
  return {
    schema_version: 2,
    template_version: CURRENT_LEGAL_TEMPLATE_VERSION,
    document_type: "kiosk_contract",
    contract_id: contract.id,
    organization_id: contract.organization_id,
    employee_id: contract.employee_id,
    employee_name_snapshot: employeeName,
    title: contract.title,
    activity_description: contract.activity_description,
    schedule: contract.schedule,
    validity_text: contract.validity_text,
    representative_name: contract.representative_name,
    status: "signed",
    participant_pin_verified: !!contract.employee_pin_verified,
    participant_verified_at: contract.participant_verified_at,
    participant_signed_at: contract.participant_signed_at,
    participant_sign_url: contract.participant_sign_url,
    admin_employee_id: adminEmployeeId,
    admin_signed_at: adminSignedAt,
    admin_sign_url: adminSignUrl,
    signed_at: adminSignedAt,
    rendered_content: buildCurrentContractRenderedContent(employeeName),
  };
}

export function buildCurrentReceiptSnapshot(
  receipt: ReceiptSnapshotInput,
  signaturePath: string,
  employeeVerifiedAt: string,
  employeeSignedAt: string,
): UnknownRecord {
  return {
    schema_version: 2,
    template_version: CURRENT_LEGAL_TEMPLATE_VERSION,
    document_type: "kiosk_payment_receipt",
    receipt_id: receipt.id,
    organization_id: receipt.organization_id,
    employee_id: receipt.employee_id,
    settlement_id: receipt.settlement_id,
    year: receipt.year,
    month: receipt.month,
    employee_name_snapshot: receipt.employee_name_snapshot,
    hours_worked: Number(receipt.hours_worked || 0),
    hourly_rate: Number(receipt.hourly_rate || 0),
    amount_earned: Number(receipt.amount_earned || 0),
    worked_minutes: Number(receipt.worked_minutes || 0),
    slot_count: Number(receipt.slot_count || 0),
    employee_pin_verified: true,
    employee_verified_at: employeeVerifiedAt,
    employee_signed_at: employeeSignedAt,
    signature_storage_path: signaturePath,
    signed_at: employeeSignedAt,
    rendered_content: buildCurrentReceiptRenderedContent(),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    const sorted: UnknownRecord = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) {
        sorted[key] = canonicalize(entry);
      }
    }
    return sorted;
  }
  return value;
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
