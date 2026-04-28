import pytest

from services.storage import Storage


@pytest.fixture
def storage(tmp_path):
    return Storage(base_dir=str(tmp_path))


def test_save_and_load_round_trip(storage):
    state = {"user_id": "u_1", "vocabulary": [], "stats": {"correct": 1}}
    storage.save("u_1", state)
    loaded = storage.load("u_1")
    assert loaded == state


def test_load_missing_raises_keyerror(storage):
    with pytest.raises(KeyError):
        storage.load("nope")


def test_user_id_with_only_unsafe_chars_raises(storage):
    # _path() strips everything except alphanumerics, '-', '_'.
    # If nothing survives, ValueError is raised.
    with pytest.raises(ValueError):
        storage.load("../")


def test_path_traversal_is_neutralised(storage):
    # Slashes and dots get stripped, so the lookup stays inside base_dir.
    # Missing file → KeyError (not a filesystem read elsewhere).
    with pytest.raises(KeyError):
        storage.load("../../etc/passwd")


def test_get_returns_default_on_missing(storage):
    assert storage.get("nope", default={"x": 1}) == {"x": 1}


def test_exists(storage):
    storage.save("u_1", {"x": 1})
    assert storage.exists("u_1") is True
    assert storage.exists("u_2") is False


def test_save_preserves_unicode(storage):
    storage.save("u_1", {"word": "adiós"})
    assert storage.load("u_1") == {"word": "adiós"}
