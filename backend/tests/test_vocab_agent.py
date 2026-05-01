import pytest

from agents.vocab_agent import VocabAgent
from services.storage import Storage


@pytest.fixture
def storage(tmp_path):
    return Storage(base_dir=str(tmp_path))


@pytest.fixture
def agent(storage):
    return VocabAgent(storage)


def _seed(storage, user_id="u_1", words=None, idx=0):
    words = words or [
        {"word": "hola", "translation": "hello", "seen": False},
        {"word": "adios", "translation": "goodbye", "seen": False},
        {"word": "gracias", "translation": "thank you", "seen": False},
    ]
    storage.save(user_id, {
        "user_id": user_id,
        "vocabulary": words,
        "current_index": idx,
        "stats": {"correct": 0, "incorrect": 0, "close": 0},
        "native_language": "English",
        "target_language": "Spanish",
    })


def test_get_next_word_returns_current_card(agent, storage):
    _seed(storage)
    card = agent.get_next_word("u_1")
    assert card["index"] == 0
    assert card["word"] == "hola"
    assert card["translation"] == "hello"
    assert card["total"] == 3
    assert card["seen"] is False


def test_advance_moves_index(agent, storage):
    _seed(storage)
    card = agent.advance("u_1")
    assert card["index"] == 1
    assert card["word"] == "adios"


def test_advance_at_end_returns_none(agent, storage):
    _seed(storage, idx=2)
    agent.advance("u_1")  # idx -> 3 (out of range)
    card = agent.get_next_word("u_1")
    assert card is None


def test_get_previous_word_clamps_at_zero(agent, storage):
    _seed(storage, idx=0)
    agent.get_previous_word("u_1")
    card = agent.get_next_word("u_1")
    assert card["index"] == 0


def test_get_previous_word_decrements(agent, storage):
    _seed(storage, idx=2)
    card = agent.get_previous_word("u_1")
    assert card["index"] == 1


def test_seek_jumps_to_index(agent, storage):
    _seed(storage)
    card = agent.seek("u_1", 2)
    assert card["index"] == 2
    assert card["word"] == "gracias"


def test_seek_clamps_below_zero(agent, storage):
    _seed(storage, idx=1)
    card = agent.seek("u_1", -5)
    assert card["index"] == 0


def test_seek_clamps_above_total(agent, storage):
    _seed(storage)
    card = agent.seek("u_1", 99)
    assert card["index"] == 2  # total=3 → clamped to last valid index 2


def test_seek_persists_position(agent, storage):
    _seed(storage)
    agent.seek("u_1", 1)
    state = storage.load("u_1")
    assert state["current_index"] == 1


def test_mark_word_seen_flips_flag(agent, storage):
    _seed(storage)
    agent.mark_word_seen("u_1", "hola")
    state = storage.load("u_1")
    assert state["vocabulary"][0]["seen"] is True
    assert state["vocabulary"][1]["seen"] is False


def test_mark_word_seen_defaults_to_current(agent, storage):
    _seed(storage, idx=1)
    agent.mark_word_seen("u_1")
    state = storage.load("u_1")
    assert state["vocabulary"][1]["seen"] is True


def test_mark_word_seen_unknown_word_does_not_flip(agent, storage):
    _seed(storage)
    agent.mark_word_seen("u_1", "doesnotexist")
    state = storage.load("u_1")
    assert all(v["seen"] is False for v in state["vocabulary"])


def test_mark_word_seen_skips_save_when_already_seen(storage):
    _seed(storage, words=[{"word": "hola", "translation": "hello", "seen": True}])

    save_calls = []
    real_save = storage.save

    def counting_save(uid, state):
        save_calls.append(uid)
        real_save(uid, state)

    storage.save = counting_save  # type: ignore[method-assign]
    VocabAgent(storage).mark_word_seen("u_1", "hola")
    assert save_calls == []  # already seen → no write


def test_mark_word_seen_skips_save_when_idx_out_of_range(storage):
    _seed(storage, idx=99)
    save_calls = []
    real_save = storage.save

    def counting_save(uid, state):
        save_calls.append(uid)
        real_save(uid, state)

    storage.save = counting_save  # type: ignore[method-assign]
    VocabAgent(storage).mark_word_seen("u_1")
    assert save_calls == []
