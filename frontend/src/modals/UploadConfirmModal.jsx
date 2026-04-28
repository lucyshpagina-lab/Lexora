import React from "react";
import GothicModal from "./GothicModal.jsx";

export default function UploadConfirmModal({ onConfirm, onCancel }) {
  return (
    <GothicModal
      title="A binding choice"
      body="Only one vocabulary will shape your path."
      confirmLabel="Bind it"
      cancelLabel="Reconsider"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
